-- 0005: 참여(모임) 방식 되살리기: 글에 참여하면 그 글의 단체 채팅방이 열린다. + 가입 동의 기록
-- 0004까지 적용된 DB 위에서 실행한다.

-- ───────────────────────── 글: 모집 인원 · 마감 ─────────────────────────
drop view if exists public.post_feed;
alter table public.posts add column capacity int not null default 4 check (capacity between 2 and 10);
alter table public.posts add column closed   boolean not null default false;

-- ───────────────────────── 참여자 ─────────────────────────
create table public.post_members (
  post_id   bigint not null references public.posts (id) on delete cascade,
  user_id   uuid   not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (post_id, user_id)
);
create index post_members_user_idx on public.post_members (user_id);
alter table public.post_members enable row level security;
create policy post_members_read on public.post_members for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_members.post_id));   -- 볼 수 있는 글의 참여자만
revoke all on public.post_members from anon, authenticated;
grant select on public.post_members to authenticated;

insert into public.post_members (post_id, user_id, joined_at) select id, author_id, created_at from public.posts;

create view public.post_feed with (security_invoker = true) as
select p.*,
       (select count(*)::int from public.comments c where c.post_id = p.id) as comment_count,
       (select count(*)::int from public.post_members m where m.post_id = p.id) as member_count
from public.posts p;
revoke all on public.post_feed from anon, authenticated;
grant select on public.post_feed to authenticated;

-- ───────────────────────── 글쓰기: 모집 인원 포함, 작성자는 자동 참여 ─────────────────────────
drop function if exists public.create_post(public.post_kind, text, text, timestamptz, timestamptz);
create function public.create_post(
  p_kind public.post_kind, p_title text, p_body text,
  p_starts timestamptz default null, p_ends timestamptz default null, p_capacity int default 4
) returns bigint
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
  if p_capacity is null or p_capacity not between 2 and 10 then raise exception 'BAD_CAPACITY'; end if;
  if p_ends is not null and p_starts is null then raise exception 'BAD_TIME'; end if;
  if p_starts is not null then
    if p_starts < now() - interval '1 hour' or p_starts > now() + interval '60 days' then raise exception 'BAD_TIME'; end if;
    if p_ends is not null and (p_ends <= p_starts or p_ends > p_starts + interval '12 hours') then raise exception 'BAD_TIME'; end if;
  end if;
  if (select count(*) from public.posts where author_id = v and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.posts (school_id, author_id, kind, title, body, starts_at, ends_at, capacity)
  values (public.my_school(), v, p_kind, t, b, p_starts, p_ends, p_capacity) returning id into new_id;
  insert into public.post_members (post_id, user_id) values (new_id, v);
  return new_id;
end $$;

-- ───────────────────────── 참여 · 나가기 · 마감 ─────────────────────────
create function public.join_post(p_id bigint) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); p public.posts; n int;
begin
  select * into p from public.posts where id = p_id for update;           -- 마지막 자리에 동시에 눌러도 정원을 넘지 않게 잠근다
  if not found or p.school_id <> public.my_school() or p.hidden or public.is_blocked_pair(v, p.author_id) then
    raise exception 'POST_NOT_FOUND';
  end if;
  if exists (select 1 from public.post_members where post_id = p_id and user_id = v) then raise exception 'ALREADY_JOINED'; end if;
  if p.closed then raise exception 'POST_CLOSED'; end if;
  select count(*) into n from public.post_members where post_id = p_id;
  if n >= p.capacity then raise exception 'POST_FULL'; end if;
  insert into public.post_members (post_id, user_id) values (p_id, v);
  perform public.push_notification(p.author_id, 'join', public.nick_of(v) || '님이 「' || p.title || '」에 참여했어요.', p_id, v);
end $$;

create function public.leave_post(p_id bigint) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); p public.posts;
begin
  select * into p from public.posts where id = p_id;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if p.author_id = v then raise exception 'AUTHOR_CANNOT_LEAVE'; end if;   -- 작성자는 글을 삭제해야 한다
  delete from public.post_members where post_id = p_id and user_id = v;
  if not found then raise exception 'NOT_JOINED'; end if;
end $$;

create function public.set_post_closed(p_id bigint, p_closed boolean) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  update public.posts set closed = coalesce(p_closed, false) where id = p_id and author_id = v;
  if not found then raise exception 'NOT_AUTHOR'; end if;
end $$;

-- ───────────────────────── 단체 채팅 ─────────────────────────
alter table public.messages add column post_id bigint references public.posts (id) on delete cascade;
alter table public.messages alter column dm_id drop not null;
alter table public.messages add constraint messages_room_check check ((dm_id is not null)::int + (post_id is not null)::int = 1);
create index messages_post_idx on public.messages (post_id, id);

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (
    public.is_active()
    and not hidden
    and not public.is_blocked_pair(auth.uid(), sender_id)
    and (
      (dm_id is not null and exists (select 1 from public.dm_rooms d where d.id = messages.dm_id and auth.uid() in (d.user_a, d.user_b)))
      or
      -- 단체 채팅: 참여한 시각 이후의 메시지만 보인다.
      (post_id is not null and exists (select 1 from public.post_members pm
                                        where pm.post_id = messages.post_id and pm.user_id = auth.uid() and messages.created_at >= pm.joined_at))
    )
  );

create function public.send_group_message(p_post bigint, p_body text) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); body text := btrim(coalesce(p_body, '')); new_id bigint;
begin
  if char_length(body) not between 1 and 500 then raise exception 'BAD_MESSAGE'; end if;
  if (select count(*) from public.messages where sender_id = v and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'RATE_LIMIT';
  end if;
  if not exists (select 1 from public.post_members pm join public.posts p on p.id = pm.post_id
                  where pm.post_id = p_post and pm.user_id = v and not p.hidden) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  insert into public.messages (post_id, sender_id, body) values (p_post, v, body) returning id into new_id;
  return new_id;
end $$;

alter table public.room_reads drop constraint if exists room_reads_room_key_check;
alter table public.room_reads add constraint room_reads_room_key_check check (room_key ~ '^[dp]:[0-9]+$');

create or replace function public.mark_read(p_key text) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  if p_key !~ '^[dp]:[0-9]+$' then raise exception 'BAD_ROOM'; end if;
  if left(p_key, 1) = 'd' then
    if not exists (select 1 from public.dm_rooms d where 'd:' || d.id = p_key and v in (d.user_a, d.user_b)) then raise exception 'ROOM_NOT_FOUND'; end if;
  else
    if not exists (select 1 from public.post_members pm where 'p:' || pm.post_id = p_key and pm.user_id = v) then raise exception 'ROOM_NOT_FOUND'; end if;
  end if;
  insert into public.room_reads (user_id, room_key, last_read_at) values (v, p_key, clock_timestamp())
  on conflict (user_id, room_key) do update set last_read_at = excluded.last_read_at;
end $$;

-- 내 채팅 목록: 친구와의 1:1(kind='dm') + 내 모임 단체 채팅(kind='group')
drop function if exists public.my_rooms();
create function public.my_rooms()
returns table (room_key text, kind text, dm_id bigint, post_id bigint, other_user uuid, title text, member_count int,
               last_body text, last_at timestamptz, last_sender uuid, unread int)
language sql stable security invoker set search_path = public as
$$
  select x.room_key, x.kind, x.dm_id, x.post_id, x.other_user, x.title, x.member_count, x.last_body, x.last_at, x.last_sender, x.unread
  from (
    select 'd:' || r.id as room_key, 'dm'::text as kind, r.id as dm_id, null::bigint as post_id,
           case when r.user_a = auth.uid() then r.user_b else r.user_a end as other_user,
           null::text as title, null::int as member_count,
           lm.body as last_body, lm.created_at as last_at, lm.sender_id as last_sender,
           (select count(*)::int from messages m
             where m.dm_id = r.id and m.sender_id is distinct from auth.uid()
               and m.created_at > coalesce((select rr.last_read_at from room_reads rr
                                             where rr.user_id = auth.uid() and rr.room_key = 'd:' || r.id), '-infinity')) as unread,
           coalesce(lm.created_at, r.created_at) as sort_at
    from dm_rooms r
    left join lateral (
      select m.body, m.created_at, m.sender_id from messages m where m.dm_id = r.id order by m.id desc limit 1
    ) lm on true
    where auth.uid() in (r.user_a, r.user_b)
      and exists (select 1 from friendships f where f.status = 'accepted'
                   and ((f.requester_id = r.user_a and f.addressee_id = r.user_b) or (f.requester_id = r.user_b and f.addressee_id = r.user_a)))
      and not exists (select 1 from blocks b
                   where (b.blocker_id = r.user_a and b.blocked_id = r.user_b) or (b.blocker_id = r.user_b and b.blocked_id = r.user_a))
    union all
    select 'p:' || p.id, 'group'::text, null::bigint, p.id, null::uuid, p.title,
           (select count(*)::int from post_members x where x.post_id = p.id),
           lm.body, lm.created_at, lm.sender_id,
           (select count(*)::int from messages m
             where m.post_id = p.id and m.sender_id is distinct from auth.uid() and not m.hidden
               and m.created_at >= pm.joined_at
               and m.created_at > coalesce((select rr.last_read_at from room_reads rr
                                             where rr.user_id = auth.uid() and rr.room_key = 'p:' || p.id), '-infinity')),
           coalesce(lm.created_at, pm.joined_at)
    from post_members pm
    join posts p on p.id = pm.post_id
    left join lateral (
      select m.body, m.created_at, m.sender_id from messages m
       where m.post_id = p.id and not m.hidden and m.created_at >= pm.joined_at order by m.id desc limit 1
    ) lm on true
    where pm.user_id = auth.uid() and not p.hidden
  ) x
  order by x.sort_at desc
$$;

-- ───────────────────────── 가입 동의 기록 ─────────────────────────
alter table public.profiles add column terms_agreed_at timestamptz, add column terms_version text;

drop function if exists public.create_profile(text, public.gender_t, int);
create function public.create_profile(p_nickname text, p_gender public.gender_t, p_school int, p_agreed boolean default false)
returns void language plpgsql security definer set search_path = '' as
$$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'NOT_LOGGED_IN'; end if;
  if exists (select 1 from public.profiles where id = v) then raise exception 'PROFILE_EXISTS'; end if;
  if not coalesce(p_agreed, false) then raise exception 'TERMS_REQUIRED'; end if;   -- 만 14세 이상 · 이용약관 · 개인정보 수집 동의
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  if p_gender is null or p_gender not in ('남성', '여성') then raise exception 'BAD_GENDER'; end if;
  if not exists (select 1 from public.schools where id = p_school) then raise exception 'BAD_SCHOOL'; end if;
  insert into public.profiles (id, school_id, nickname, gender, terms_agreed_at, terms_version)
  values (v, p_school, p_nickname, p_gender, now(), '2026-11-01');
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;

-- ───────────────────────── 권한 · 실시간 ─────────────────────────
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_profile(text, public.gender_t, int, boolean),
  public.create_post(public.post_kind, text, text, timestamptz, timestamptz, int),
  public.join_post(bigint), public.leave_post(bigint), public.set_post_closed(bigint, boolean),
  public.send_group_message(bigint, text), public.mark_read(text), public.my_rooms()
to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.post_members;
  end if;
end $$;
