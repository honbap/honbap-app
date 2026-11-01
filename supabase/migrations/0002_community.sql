-- 0002: 커뮤니티형으로 단순화
--  · 가입: 학교 이메일 인증 제거. 학교는 목록에서 골라 분류만 한다. 성별은 처음 가입할 때 한 번만 정한다.
--  · 게시판: 글 = 제목 + 내용, 댓글. (밥 / 공부 두 게시판)
--  · 채팅: 친구와의 1:1 채팅 하나만. 읽음 표시 지원.
-- 0001이 적용된 DB 위에서 실행한다. (게시글·모임·단체 채팅 데이터는 삭제된다.)

-- ───────────────────────── 정리 ─────────────────────────
drop trigger  if exists enforce_school_email on auth.users;
drop function if exists public.enforce_school_email();
drop function if exists public.create_profile(text, public.gender_t, text);
drop function if exists public.update_profile(text, public.gender_t, text);
drop function if exists public.create_post(public.post_kind, text, text, timestamptz, timestamptz, text, text, text, int, text);
drop function if exists public.join_post(bigint);
drop function if exists public.leave_post(bigint);
drop function if exists public.set_post_closed(bigint, boolean);
drop function if exists public.cancel_post(bigint);
drop function if exists public.update_post(bigint, timestamptz, timestamptz, text, text, int);
drop function if exists public.send_message(bigint, bigint, text);
drop function if exists public.my_rooms();

drop view   if exists public.post_feed;
drop policy if exists messages_read on public.messages;
drop policy if exists profiles_read on public.profiles;

delete from public.reports where target_post is not null or target_comment is not null;
-- 신고 대상이 지워져도(탈퇴 등) 신고 기록은 남도록, "대상 하나는 있어야 한다"는 제약을 없앤다. (report_content가 확인한다)
alter table public.reports drop constraint if exists reports_check;
delete from public.notifications where post_id is not null;
delete from public.messages where dm_id is null or system;
delete from public.room_reads where room_key like 'p:%';

drop table public.post_members;
drop table public.comments cascade;
drop table public.posts cascade;

alter table public.messages drop column post_id;
alter table public.messages alter column dm_id set not null;
alter table public.room_reads drop constraint if exists room_reads_room_key_check;
alter table public.room_reads add constraint room_reads_room_key_check check (room_key ~ '^d:[0-9]+$');

-- 학교는 이름 목록만 둔다.
alter table public.profiles drop column campus;
alter table public.schools  drop column email_domains;
alter table public.schools  drop column campuses;

-- ───────────────────────── 글 · 댓글 ─────────────────────────
create table public.posts (
  id         bigint generated always as identity primary key,
  school_id  int  not null references public.schools (id),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  kind       public.post_kind not null,                      -- meal(밥) / study(공부)
  title      text not null check (char_length(title) between 1 and 40),
  body       text not null check (char_length(body) between 1 and 1000),
  hidden     boolean not null default false,                 -- 운영자가 숨김
  created_at timestamptz not null default now()
);
create index posts_feed_idx   on public.posts (school_id, kind, id desc);
create index posts_author_idx on public.posts (author_id);

create table public.comments (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references public.posts (id) on delete cascade,
  author_id  uuid   not null references public.profiles (id) on delete cascade,
  body       text   not null check (char_length(body) between 1 and 200),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, id);

alter table public.notifications
  add constraint notifications_post_id_fkey foreign key (post_id) references public.posts (id) on delete cascade;
alter table public.reports
  add constraint reports_target_post_fkey    foreign key (target_post)    references public.posts (id)    on delete set null,
  add constraint reports_target_comment_fkey foreign key (target_comment) references public.comments (id) on delete set null;

create view public.post_feed with (security_invoker = true) as
select p.*, (select count(*)::int from public.comments c where c.post_id = p.id) as comment_count
from public.posts p;

-- ───────────────────────── RLS ─────────────────────────
alter table public.posts    enable row level security;
alter table public.comments enable row level security;

-- 내 프로필은 항상 보이고, 다른 사람은 같은 학교이거나 친구일 때만 보인다.
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (public.is_active() and (
         school_id = public.my_school()
         or exists (select 1 from public.friendships f
                     where (f.requester_id = auth.uid() and f.addressee_id = profiles.id)
                        or (f.addressee_id = auth.uid() and f.requester_id = profiles.id))
       ))
  );

create policy posts_read on public.posts for select to authenticated
  using (
    school_id = public.my_school()
    and public.is_active()
    and (not hidden or public.is_admin())
    and not public.is_blocked_pair(auth.uid(), author_id)
  );

create policy comments_read on public.comments for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = comments.post_id)
    and (not hidden or public.is_admin())
    and not public.is_blocked_pair(auth.uid(), author_id)
  );

-- 1:1 채팅: 방 참여자만 본다. 차단한 사이의 메시지와 숨김 메시지는 안 보인다.
create policy messages_read on public.messages for select to authenticated
  using (
    public.is_active()
    and not hidden
    and not public.is_blocked_pair(auth.uid(), sender_id)
    and exists (select 1 from public.dm_rooms d where d.id = messages.dm_id and auth.uid() in (d.user_a, d.user_b))
  );

-- 읽음 표시: 같은 채팅방 상대가 어디까지 읽었는지 볼 수 있다.
create policy room_reads_peer on public.room_reads for select to authenticated
  using (exists (select 1 from public.dm_rooms d
                  where 'd:' || d.id = room_reads.room_key and auth.uid() in (d.user_a, d.user_b)));

revoke all on public.posts, public.comments, public.post_feed from anon, authenticated;
grant select on public.posts, public.comments, public.post_feed to authenticated;

-- ───────────────────────── 가입 · 프로필 ─────────────────────────
-- 닉네임 + 성별(처음 한 번) + 학교(목록에서 선택). 성별은 이후 바꿀 수 없다.
create function public.create_profile(p_nickname text, p_gender public.gender_t, p_school int)
returns void language plpgsql security definer set search_path = '' as
$$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'NOT_LOGGED_IN'; end if;
  if exists (select 1 from public.profiles where id = v) then raise exception 'PROFILE_EXISTS'; end if;
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  if p_gender is null or p_gender not in ('남성', '여성') then raise exception 'BAD_GENDER'; end if;
  if not exists (select 1 from public.schools where id = p_school) then raise exception 'BAD_SCHOOL'; end if;
  insert into public.profiles (id, school_id, nickname, gender) values (v, p_school, p_nickname, p_gender);
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;

create function public.update_profile(p_nickname text, p_school int)
returns void language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); old_school int := public.my_school();
begin
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  if not exists (select 1 from public.schools where id = p_school) then raise exception 'BAD_SCHOOL'; end if;
  update public.profiles set nickname = p_nickname, school_id = p_school where id = v;
  if p_school <> old_school then
    update public.posts set school_id = p_school where author_id = v;   -- 내 글도 새 학교로 따라간다
  end if;
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;

-- ───────────────────────── 글 · 댓글 함수 ─────────────────────────
create function public.create_post(p_kind public.post_kind, p_title text, p_body text) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active();
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  new_id bigint;
begin
  if char_length(t) not between 1 and 40 then raise exception 'BAD_TITLE'; end if;
  if char_length(b) not between 1 and 1000 then raise exception 'BAD_BODY'; end if;
  if (select count(*) from public.posts where author_id = v and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.posts (school_id, author_id, kind, title, body)
  values (public.my_school(), v, p_kind, t, b) returning id into new_id;
  return new_id;
end $$;

create function public.delete_post(p_id bigint) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  delete from public.posts where id = p_id and author_id = v;
  if not found then raise exception 'NOT_AUTHOR'; end if;
end $$;

create or replace function public.add_comment(p_post bigint, p_body text) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); new_id bigint; p public.posts; b text := btrim(coalesce(p_body, ''));
begin
  if char_length(b) not between 1 and 200 then raise exception 'BAD_COMMENT'; end if;
  select * into p from public.posts
   where id = p_post and school_id = public.my_school() and not hidden and not public.is_blocked_pair(v, author_id);
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if (select count(*) from public.comments where author_id = v and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.comments (post_id, author_id, body) values (p_post, v, b) returning id into new_id;
  if p.author_id <> v then
    perform public.push_notification(p.author_id, 'comment', public.nick_of(v) || '님이 「' || p.title || '」에 댓글을 남겼어요.', p_post, v);
  end if;
  return new_id;
end $$;

create function public.delete_comment(p_id bigint) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  delete from public.comments where id = p_id and author_id = v;
  if not found then raise exception 'NOT_AUTHOR'; end if;
end $$;

-- ───────────────────────── 채팅(1:1) ─────────────────────────
create function public.send_message(p_dm_id bigint, p_body text) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active();
  body text := btrim(coalesce(p_body, ''));
  r public.dm_rooms;
  other uuid;
  new_id bigint;
begin
  if char_length(body) not between 1 and 500 then raise exception 'BAD_MESSAGE'; end if;
  if (select count(*) from public.messages where sender_id = v and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'RATE_LIMIT';
  end if;
  select * into r from public.dm_rooms where id = p_dm_id;
  if not found or v not in (r.user_a, r.user_b) then raise exception 'ROOM_NOT_FOUND'; end if;
  other := case when r.user_a = v then r.user_b else r.user_a end;
  if public.is_blocked_pair(v, other) then raise exception 'BLOCKED'; end if;
  if not exists (select 1 from public.friendships f where f.status = 'accepted'
                  and ((f.requester_id = v and f.addressee_id = other) or (f.requester_id = other and f.addressee_id = v))) then
    raise exception 'NOT_FRIENDS';
  end if;
  insert into public.messages (dm_id, sender_id, body) values (p_dm_id, v, body) returning id into new_id;
  return new_id;
end $$;

-- 읽음 처리: 이 시각까지 읽었다고 기록한다. 상대 화면에 "읽음"이 뜬다.
create or replace function public.mark_read(p_key text) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  if p_key !~ '^d:[0-9]+$' then raise exception 'BAD_ROOM'; end if;
  if not exists (select 1 from public.dm_rooms d where 'd:' || d.id = p_key and v in (d.user_a, d.user_b)) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  insert into public.room_reads (user_id, room_key, last_read_at) values (v, p_key, clock_timestamp())
  on conflict (user_id, room_key) do update set last_read_at = excluded.last_read_at;
end $$;

-- 내 채팅방 목록: 친구와의 1:1 방, 마지막 메시지, 안 읽은 수
create function public.my_rooms()
returns table (room_key text, dm_id bigint, other_user uuid, last_body text, last_at timestamptz, last_sender uuid, unread int)
language sql stable security invoker set search_path = public as
$$
  select 'd:' || r.id, r.id,
         case when r.user_a = auth.uid() then r.user_b else r.user_a end,
         lm.body, lm.created_at, lm.sender_id,
         (select count(*)::int from messages m
           where m.dm_id = r.id and m.sender_id is distinct from auth.uid()
             and m.created_at > coalesce((select rr.last_read_at from room_reads rr
                                           where rr.user_id = auth.uid() and rr.room_key = 'd:' || r.id), '-infinity'))
  from dm_rooms r
  left join lateral (
    select m.body, m.created_at, m.sender_id from messages m where m.dm_id = r.id order by m.id desc limit 1
  ) lm on true
  where auth.uid() in (r.user_a, r.user_b)
    and exists (select 1 from friendships f where f.status = 'accepted'
                 and ((f.requester_id = r.user_a and f.addressee_id = r.user_b) or (f.requester_id = r.user_b and f.addressee_id = r.user_a)))
    and not exists (select 1 from blocks b
                 where (b.blocker_id = r.user_a and b.blocked_id = r.user_b) or (b.blocker_id = r.user_b and b.blocked_id = r.user_a))
  order by coalesce(lm.created_at, r.created_at) desc
$$;

-- 친구 수락: 안내 메시지 없이 방만 만든다.
create or replace function public.respond_friend(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); f public.friendships;
begin
  select * into f from public.friendships where id = p_id for update;
  if not found or f.addressee_id <> v or f.status <> 'pending' then raise exception 'REQUEST_NOT_FOUND'; end if;
  if not p_accept then
    delete from public.friendships where id = p_id;
    return;
  end if;
  update public.friendships set status = 'accepted', responded_at = now() where id = p_id;
  perform public.open_dm(f.requester_id);
  perform public.push_notification(f.requester_id, 'friend_accepted', public.nick_of(v) || '님이 친구 요청을 수락했어요.', null, v);
end $$;

-- ───────────────────────── 신고 · 정리 ─────────────────────────
create or replace function public.report_content(
  p_reason text, p_detail text default '',
  p_user uuid default null, p_post bigint default null, p_comment bigint default null, p_message bigint default null
) returns void language plpgsql security invoker set search_path = '' as
$$
declare
  v uuid := public.require_active();
  t_user uuid := p_user;
  snap text := '';
  c public.comments; m public.messages; p public.posts;
begin
  if p_user is null and p_post is null and p_comment is null and p_message is null then raise exception 'NO_TARGET'; end if;
  if (select count(*) from public.reports where reporter_id = v and created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMIT';
  end if;
  if p_message is not null then
    select * into m from public.messages where id = p_message;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    t_user := coalesce(t_user, m.sender_id); snap := m.body;
  elsif p_comment is not null then
    select * into c from public.comments where id = p_comment;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    t_user := coalesce(t_user, c.author_id); snap := c.body;
  elsif p_post is not null then
    select * into p from public.posts where id = p_post;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    t_user := coalesce(t_user, p.author_id); snap := p.title || ' / ' || p.body;
  end if;
  insert into public.reports (school_id, reporter_id, target_user, target_post, target_comment, target_message, reason, detail, snapshot)
  values (public.my_school(), v, t_user, p_post, p_comment, p_message, p_reason, coalesce(p_detail, ''), snap);
end $$;

-- 오래된 알림 삭제 (pg_cron으로 매일 실행: README 참고)
create or replace function public.purge_expired() returns int
language plpgsql security definer set search_path = '' as
$$
declare n int;
begin
  delete from public.notifications where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- ───────────────────────── 함수 권한 ─────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.my_school(), public.is_active(), public.is_admin(), public.is_blocked_pair(uuid, uuid), public.require_active(),
  public.create_profile(text, public.gender_t, int), public.update_profile(text, int), public.delete_account(),
  public.create_post(public.post_kind, text, text), public.delete_post(bigint),
  public.add_comment(bigint, text), public.delete_comment(bigint),
  public.send_message(bigint, text), public.mark_read(text), public.my_rooms(),
  public.open_dm(uuid), public.request_friend(uuid), public.respond_friend(bigint, boolean),
  public.cancel_friend_request(bigint), public.remove_friend(uuid),
  public.block_user(uuid), public.unblock_user(uuid),
  public.report_content(text, text, uuid, bigint, bigint, bigint), public.mark_notifications_read(),
  public.admin_resolve_report(bigint, text, text), public.admin_set_suspended(uuid, boolean)
to authenticated;

-- ───────────────────────── 실시간 ─────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.posts, public.comments, public.room_reads;
  end if;
end $$;
