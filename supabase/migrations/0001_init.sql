-- 밥친구 백엔드 스키마 (Supabase / PostgreSQL 15+)
-- 원칙: 테이블 쓰기는 전부 아래 함수(RPC)로만 한다. 클라이언트는 테이블을 읽기만 하고, 읽기 범위는 RLS가 정한다.

-- ───────────────────────── 타입 ─────────────────────────
create type public.gender_t     as enum ('남성', '여성', '기타', '미공개');
create type public.post_kind    as enum ('meal', 'study');
create type public.friend_state as enum ('pending', 'accepted');

-- ───────────────────────── 학교 ─────────────────────────
create table public.schools (
  id            int generated always as identity primary key,
  name          text   not null unique,
  email_domains text[] not null check (array_length(email_domains, 1) >= 1),
  campuses      text[] not null default '{본캠퍼스}' check (array_length(campuses, 1) >= 1)
);

-- ───────────────────────── 프로필 ─────────────────────────
-- 학교 이메일은 auth.users에만 있고 이 테이블에는 두지 않는다(다른 이용자에게 노출 금지).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  school_id  int  not null references public.schools (id),
  nickname   text not null,
  gender     public.gender_t not null default '미공개',
  campus     text not null,
  is_admin   boolean not null default false,
  suspended  boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_school_nickname_uq on public.profiles (school_id, lower(nickname));

-- ───────────────────────── 차단 ─────────────────────────
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ───────────────────────── RLS 보조 함수 ─────────────────────────
create function public.my_school() returns int
language sql stable security definer set search_path = '' as
$$ select school_id from public.profiles where id = auth.uid() $$;

create function public.is_active() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.profiles where id = auth.uid() and not suspended) $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as
$$ select coalesce((select is_admin and not suspended from public.profiles where id = auth.uid()), false) $$;

create function public.is_blocked_pair(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (
     select 1 from public.blocks
     where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
   ) $$;

create function public.require_active() returns uuid
language plpgsql stable security definer set search_path = '' as
$$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'NOT_LOGGED_IN'; end if;
  if not exists (select 1 from public.profiles where id = v and not suspended) then
    raise exception 'NO_PROFILE_OR_SUSPENDED';
  end if;
  return v;
end $$;

-- ───────────────────────── 모집글 ─────────────────────────
create table public.posts (
  id          bigint generated always as identity primary key,
  school_id   int  not null references public.schools (id),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  kind        public.post_kind not null,
  title       text not null check (char_length(title) between 2 and 40),
  description text not null default '' check (char_length(description) <= 200),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  place       text not null check (char_length(place) between 1 and 30),
  topic       text not null check (char_length(topic) between 1 and 20),  -- 밥: 메뉴 / 공부: 과목·주제
  opt         text not null,                                               -- 밥: 결제 방식 / 공부: 공부 방식
  capacity    int  not null check (capacity between 2 and 8),             -- 작성자 포함
  campus      text not null,
  closed      boolean not null default false,   -- 작성자가 직접 마감
  canceled    boolean not null default false,
  canceled_at timestamptz,
  hidden      boolean not null default false,   -- 운영자가 숨김
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  check (
    (kind = 'meal'  and opt in ('각자 결제', '협의')) or
    (kind = 'study' and opt in ('각자 조용히', '함께 문제 풀이', '대화하며 공부'))
  )
);
create index posts_school_starts_idx on public.posts (school_id, starts_at);
create index posts_author_idx on public.posts (author_id);

create table public.post_members (
  post_id   bigint not null references public.posts (id) on delete cascade,
  user_id   uuid   not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_members_user_idx on public.post_members (user_id);

create table public.comments (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references public.posts (id) on delete cascade,
  author_id  uuid   not null references public.profiles (id) on delete cascade,
  body       text   not null check (char_length(body) between 1 and 200),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, id);

-- ───────────────────────── 친구 · 1:1 채팅방 ─────────────────────────
create table public.friendships (
  id           bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friend_state not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_uq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

create table public.dm_rooms (
  id         bigint generated always as identity primary key,
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

-- ───────────────────────── 채팅 메시지 ─────────────────────────
create table public.messages (
  id         bigint generated always as identity primary key,
  post_id    bigint references public.posts (id) on delete cascade,
  dm_id      bigint references public.dm_rooms (id) on delete cascade,
  sender_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 500),
  system     boolean not null default false,
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  check ((post_id is not null)::int + (dm_id is not null)::int = 1)
);
create index messages_post_idx on public.messages (post_id, id);
create index messages_dm_idx   on public.messages (dm_id, id);

create table public.room_reads (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  room_key     text not null check (room_key ~ '^[pd]:[0-9]+$'),
  last_read_at timestamptz not null default now(),
  primary key (user_id, room_key)
);

-- ───────────────────────── 알림 · 신고 ─────────────────────────
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  body       text not null,
  post_id    bigint references public.posts (id) on delete cascade,
  ref_user   uuid,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, id desc);

create table public.reports (
  id             bigint generated always as identity primary key,
  school_id      int  not null references public.schools (id),
  reporter_id    uuid references public.profiles (id) on delete set null,
  target_user    uuid references public.profiles (id) on delete set null,
  target_post    bigint references public.posts (id) on delete set null,
  target_comment bigint references public.comments (id) on delete set null,
  target_message bigint references public.messages (id) on delete set null,
  reason         text not null check (reason in ('욕설·비하 표현', '불쾌하거나 부적절한 내용', '스팸·광고', '만남을 강요하거나 위협', '기타')),
  detail         text not null default '' check (char_length(detail) <= 300),
  snapshot       text not null default '',          -- 신고 시점의 내용(삭제돼도 증거가 남도록)
  status         text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  resolution     text not null default '',
  handled_by     uuid references public.profiles (id) on delete set null,
  handled_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (target_user is not null or target_post is not null or target_comment is not null or target_message is not null)
);
create index reports_school_status_idx on public.reports (school_id, status, id desc);

-- 모집글 + 인원 수 + 상태(모집 중/마감/진행 중/종료/취소됨)
create view public.post_feed with (security_invoker = true) as
select p.*,
       mc.c as member_count,
       case
         when p.canceled then 'canceled'
         when now() >= p.ends_at then 'ended'
         when now() >= p.starts_at then 'live'
         when p.closed or mc.c >= p.capacity then 'full'
         else 'open'
       end as status
from public.posts p
cross join lateral (select count(*)::int as c from public.post_members m where m.post_id = p.id) mc;

-- ───────────────────────── RLS ─────────────────────────
alter table public.schools       enable row level security;
alter table public.profiles      enable row level security;
alter table public.blocks        enable row level security;
alter table public.posts         enable row level security;
alter table public.post_members  enable row level security;
alter table public.comments      enable row level security;
alter table public.friendships   enable row level security;
alter table public.dm_rooms      enable row level security;
alter table public.messages      enable row level security;
alter table public.room_reads    enable row level security;
alter table public.notifications enable row level security;
alter table public.reports       enable row level security;

create policy schools_read on public.schools for select to anon, authenticated using (true);

-- 같은 학교 이용자의 프로필(닉네임·성별·캠퍼스)만 볼 수 있다.
create policy profiles_read on public.profiles for select to authenticated
  using (school_id = public.my_school() and public.is_active());

create policy blocks_read on public.blocks for select to authenticated
  using (blocker_id = auth.uid());

-- 다른 학교 글은 보이지 않고, 서로 차단한 사이의 글도 보이지 않는다. 숨김 글은 운영자만 본다.
create policy posts_read on public.posts for select to authenticated
  using (
    school_id = public.my_school()
    and public.is_active()
    and (not hidden or public.is_admin())
    and not public.is_blocked_pair(auth.uid(), author_id)
  );

create policy post_members_read on public.post_members for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_members.post_id));

create policy comments_read on public.comments for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = comments.post_id)
    and (not hidden or public.is_admin())
    and not public.is_blocked_pair(auth.uid(), author_id)
  );

create policy friendships_read on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

create policy dm_rooms_read on public.dm_rooms for select to authenticated
  using (auth.uid() in (user_a, user_b));

-- 단체 채팅은 "참여한 시각 이후" 메시지만, 1:1은 방 참여자만 본다. 차단한 사이의 메시지는 숨긴다.
create policy messages_read on public.messages for select to authenticated
  using (
    public.is_active()
    and not hidden
    and not public.is_blocked_pair(auth.uid(), sender_id)
    and (
      (post_id is not null and exists (
         select 1 from public.post_members pm
         where pm.post_id = messages.post_id and pm.user_id = auth.uid() and messages.created_at >= pm.joined_at))
      or
      (dm_id is not null and exists (
         select 1 from public.dm_rooms d where d.id = messages.dm_id and auth.uid() in (d.user_a, d.user_b)))
    )
  );

create policy room_reads_read on public.room_reads for select to authenticated
  using (user_id = auth.uid());

create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.is_active());
create policy reports_admin_read on public.reports for select to authenticated
  using (public.is_admin() and school_id = public.my_school());

-- ───────────────────────── 테이블 권한 ─────────────────────────
revoke all on all tables in schema public from anon, authenticated;
grant select on public.schools to anon, authenticated;
grant select on public.profiles, public.blocks, public.posts, public.post_members, public.comments,
                public.friendships, public.dm_rooms, public.messages, public.room_reads,
                public.notifications, public.reports, public.post_feed to authenticated;
grant insert on public.reports to authenticated;

-- ───────────────────────── 내부 알림 함수 ─────────────────────────
create function public.push_notification(p_user uuid, p_kind text, p_body text, p_post bigint default null, p_ref uuid default null)
returns void language sql security definer set search_path = '' as
$$ insert into public.notifications (user_id, kind, body, post_id, ref_user) values (p_user, p_kind, p_body, p_post, p_ref) $$;

create function public.nick_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as
$$ select nickname from public.profiles where id = p_user $$;

-- ───────────────────────── 가입 · 프로필 ─────────────────────────
-- 학교 이메일이 아닌 주소는 가입 자체를 막는다.
create function public.enforce_school_email() returns trigger
language plpgsql security definer set search_path = '' as
$$
begin
  if not exists (
    select 1 from public.schools s
    where lower(split_part(coalesce(new.email, ''), '@', 2)) in (select lower(d) from unnest(s.email_domains) d)
  ) then
    raise exception 'SCHOOL_EMAIL_REQUIRED';
  end if;
  return new;
end $$;

create trigger enforce_school_email before insert on auth.users
  for each row execute function public.enforce_school_email();

create function public.create_profile(p_nickname text, p_gender public.gender_t, p_campus text)
returns void language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  s public.schools;
begin
  if v is null then raise exception 'NOT_LOGGED_IN'; end if;
  if exists (select 1 from public.profiles where id = v) then raise exception 'PROFILE_EXISTS'; end if;
  select sc.* into s from public.schools sc
   where split_part(v_email, '@', 2) in (select lower(d) from unnest(sc.email_domains) d) limit 1;
  if not found then raise exception 'SCHOOL_EMAIL_REQUIRED'; end if;
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  if not (p_campus = any (s.campuses)) then raise exception 'BAD_CAMPUS'; end if;
  insert into public.profiles (id, school_id, nickname, gender, campus)
  values (v, s.id, p_nickname, coalesce(p_gender, '미공개'), p_campus);
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;

create function public.update_profile(p_nickname text, p_gender public.gender_t, p_campus text)
returns void language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); sid int := public.my_school(); ok boolean;
begin
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  select p_campus = any (campuses) into ok from public.schools where id = sid;
  if not coalesce(ok, false) then raise exception 'BAD_CAMPUS'; end if;
  update public.profiles set nickname = p_nickname, gender = p_gender, campus = p_campus where id = v;
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;

-- 탈퇴: 계정과 그 이용자가 쓴 글·참여·친구 관계가 함께 삭제된다.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as
$$
begin
  if auth.uid() is null then raise exception 'NOT_LOGGED_IN'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ───────────────────────── 모집글 ─────────────────────────
create function public.create_post(
  p_kind public.post_kind, p_title text, p_description text,
  p_starts timestamptz, p_ends timestamptz,
  p_place text, p_topic text, p_opt text, p_capacity int, p_campus text
) returns bigint language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active();
  sid int := public.my_school();
  ok boolean;
  new_id bigint;
begin
  select p_campus = any (campuses) into ok from public.schools where id = sid;
  if not coalesce(ok, false) then raise exception 'BAD_CAMPUS'; end if;
  if p_starts < now() then raise exception 'START_IN_PAST'; end if;
  if p_ends <= p_starts then raise exception 'END_BEFORE_START'; end if;
  if p_ends - p_starts > interval '12 hours' then raise exception 'TOO_LONG'; end if;
  if p_starts > now() + interval '14 days' then raise exception 'TOO_FAR'; end if;
  if (select count(*) from public.posts
       where author_id = v and not canceled and ends_at > now()) >= 5 then
    raise exception 'TOO_MANY_POSTS';
  end if;

  insert into public.posts (school_id, author_id, kind, title, description, starts_at, ends_at, place, topic, opt, capacity, campus)
  values (sid, v, p_kind, btrim(p_title), btrim(coalesce(p_description, '')), p_starts, p_ends,
          btrim(p_place), btrim(p_topic), p_opt, p_capacity, p_campus)
  returning id into new_id;

  insert into public.post_members (post_id, user_id) values (new_id, v);
  insert into public.messages (post_id, body, system) values (new_id, '모임이 만들어졌어요.', true);
  return new_id;
end $$;

-- 참여: 행을 잠가서 마지막 자리에 여러 명이 동시에 눌러도 정원을 넘지 않는다.
create function public.join_post(p_id bigint) returns void
language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active();
  p public.posts;
  cnt int;
begin
  select * into p from public.posts where id = p_id for update;
  if not found or p.hidden or p.school_id <> public.my_school() then raise exception 'POST_NOT_FOUND'; end if;
  if p.canceled then raise exception 'POST_CANCELED'; end if;
  if now() >= p.starts_at then raise exception 'ALREADY_STARTED'; end if;
  if exists (select 1 from public.post_members where post_id = p_id and user_id = v) then raise exception 'ALREADY_MEMBER'; end if;
  if p.closed then raise exception 'POST_CLOSED'; end if;
  select count(*) into cnt from public.post_members where post_id = p_id;
  if cnt >= p.capacity then raise exception 'POST_FULL'; end if;
  if exists (
    select 1 from public.post_members pm
    join public.blocks b on (b.blocker_id = v and b.blocked_id = pm.user_id) or (b.blocker_id = pm.user_id and b.blocked_id = v)
    where pm.post_id = p_id
  ) then raise exception 'BLOCKED_MEMBER'; end if;

  insert into public.post_members (post_id, user_id) values (p_id, v);
  insert into public.messages (post_id, body, system)
    values (p_id, public.nick_of(v) || '님이 참여했어요.', true);
  perform public.push_notification(p.author_id, 'join', public.nick_of(v) || '님이 「' || p.title || '」에 참여했어요.', p_id, v);
end $$;

create function public.leave_post(p_id bigint) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); p public.posts;
begin
  select * into p from public.posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if p.author_id = v then raise exception 'AUTHOR_CANNOT_LEAVE'; end if;
  if now() >= p.starts_at then raise exception 'ALREADY_STARTED'; end if;
  delete from public.post_members where post_id = p_id and user_id = v;
  if not found then raise exception 'NOT_MEMBER'; end if;
  insert into public.messages (post_id, body, system) values (p_id, public.nick_of(v) || '님이 나갔어요.', true);
  perform public.push_notification(p.author_id, 'leave', public.nick_of(v) || '님이 「' || p.title || '」 참여를 취소했어요.', p_id, v);
end $$;

create function public.set_post_closed(p_id bigint, p_closed boolean) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); p public.posts;
begin
  select * into p from public.posts where id = p_id for update;
  if not found or p.author_id <> v then raise exception 'NOT_AUTHOR'; end if;
  if p.canceled or now() >= p.starts_at then raise exception 'ALREADY_STARTED'; end if;
  update public.posts set closed = p_closed where id = p_id;
end $$;

create function public.cancel_post(p_id bigint) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); p public.posts; m record;
begin
  select * into p from public.posts where id = p_id for update;
  if not found or p.author_id <> v then raise exception 'NOT_AUTHOR'; end if;
  if p.canceled or now() >= p.ends_at then raise exception 'POST_FINISHED'; end if;
  update public.posts set canceled = true, canceled_at = now() where id = p_id;
  insert into public.messages (post_id, body, system) values (p_id, '작성자가 모임을 취소했어요.', true);
  for m in select user_id from public.post_members where post_id = p_id and user_id <> v loop
    perform public.push_notification(m.user_id, 'canceled', '「' || p.title || '」 모임이 취소됐어요.', p_id, v);
  end loop;
end $$;

-- 시간·장소·설명·정원 수정. 정원은 이미 참여한 인원보다 작게 줄일 수 없다.
create function public.update_post(
  p_id bigint, p_starts timestamptz, p_ends timestamptz, p_place text, p_description text, p_capacity int
) returns void language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active();
  p public.posts;
  cnt int;
  changed text := '';
  m record;
begin
  select * into p from public.posts where id = p_id for update;
  if not found or p.author_id <> v then raise exception 'NOT_AUTHOR'; end if;
  if p.canceled or now() >= p.starts_at then raise exception 'ALREADY_STARTED'; end if;
  if p_starts < now() then raise exception 'START_IN_PAST'; end if;
  if p_ends <= p_starts then raise exception 'END_BEFORE_START'; end if;
  if p_ends - p_starts > interval '12 hours' then raise exception 'TOO_LONG'; end if;
  if p_starts > now() + interval '14 days' then raise exception 'TOO_FAR'; end if;
  select count(*) into cnt from public.post_members where post_id = p_id;
  if p_capacity < cnt then raise exception 'CAPACITY_BELOW_MEMBERS'; end if;

  if p_starts <> p.starts_at or p_ends <> p.ends_at then changed := changed || '시간'; end if;
  if btrim(p_place) <> p.place then changed := changed || case when changed = '' then '' else '·' end || '장소'; end if;

  update public.posts
     set starts_at = p_starts, ends_at = p_ends, place = btrim(p_place),
         description = btrim(coalesce(p_description, '')), capacity = p_capacity
   where id = p_id;

  if changed <> '' then
    insert into public.messages (post_id, body, system) values (p_id, '작성자가 ' || changed || '을(를) 바꿨어요.', true);
    for m in select user_id from public.post_members where post_id = p_id and user_id <> v loop
      perform public.push_notification(m.user_id, 'changed', '「' || p.title || '」의 ' || changed || '이(가) 바뀌었어요.', p_id, v);
    end loop;
  end if;
end $$;

create function public.add_comment(p_post bigint, p_body text) returns bigint
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

-- ───────────────────────── 채팅 ─────────────────────────
create function public.send_message(p_post_id bigint, p_dm_id bigint, p_body text) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active();
  body text := btrim(coalesce(p_body, ''));
  p public.posts;
  r public.dm_rooms;
  other uuid;
  new_id bigint;
begin
  if char_length(body) not between 1 and 500 then raise exception 'BAD_MESSAGE'; end if;
  if (p_post_id is null) = (p_dm_id is null) then raise exception 'BAD_ROOM'; end if;
  if (select count(*) from public.messages where sender_id = v and created_at > now() - interval '10 seconds') >= 8 then
    raise exception 'RATE_LIMIT';
  end if;

  if p_post_id is not null then
    select * into p from public.posts where id = p_post_id;
    if not found or p.hidden then raise exception 'ROOM_NOT_FOUND'; end if;
    if not exists (select 1 from public.post_members where post_id = p_post_id and user_id = v) then raise exception 'NOT_MEMBER'; end if;
    if p.canceled or now() > p.ends_at + interval '7 days' then raise exception 'ROOM_CLOSED'; end if;
    insert into public.messages (post_id, sender_id, body) values (p_post_id, v, body) returning id into new_id;
  else
    select * into r from public.dm_rooms where id = p_dm_id;
    if not found or v not in (r.user_a, r.user_b) then raise exception 'ROOM_NOT_FOUND'; end if;
    other := case when r.user_a = v then r.user_b else r.user_a end;
    if public.is_blocked_pair(v, other) then raise exception 'BLOCKED'; end if;
    if not exists (select 1 from public.friendships f where f.status = 'accepted'
                    and ((f.requester_id = v and f.addressee_id = other) or (f.requester_id = other and f.addressee_id = v))) then
      raise exception 'NOT_FRIENDS';
    end if;
    insert into public.messages (dm_id, sender_id, body) values (p_dm_id, v, body) returning id into new_id;
  end if;
  return new_id;
end $$;

create function public.mark_read(p_key text) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  if p_key !~ '^[pd]:[0-9]+$' then raise exception 'BAD_ROOM'; end if;
  insert into public.room_reads (user_id, room_key, last_read_at) values (v, p_key, clock_timestamp())
  on conflict (user_id, room_key) do update set last_read_at = excluded.last_read_at;
end $$;

-- 내 채팅방 목록(단체 + 1:1), 마지막 메시지, 안 읽은 수
create function public.my_rooms()
returns table (
  room_key text, kind text, post_id bigint, dm_id bigint, other_user uuid, title text, post_type text,
  member_count int, last_body text, last_at timestamptz, last_sender uuid, last_system boolean, unread int
)
language sql stable security invoker set search_path = public as
$$
  with rooms as (
    select 'p:' || p.id as room_key, 'group'::text as kind, p.id as post_id, null::bigint as dm_id, null::uuid as other_user,
           p.title as title, p.kind::text as post_type, mc.c as member_count, pm.joined_at as since
    from post_members pm
    join posts p on p.id = pm.post_id
    cross join lateral (select count(*)::int as c from post_members x where x.post_id = p.id) mc
    where pm.user_id = auth.uid() and p.ends_at > now() - interval '7 days'
    union all
    select 'd:' || r.id, 'dm', null, r.id, case when r.user_a = auth.uid() then r.user_b else r.user_a end,
           null, null, 2, '-infinity'::timestamptz
    from dm_rooms r
    where auth.uid() in (r.user_a, r.user_b)
      and exists (select 1 from friendships f where f.status = 'accepted'
                   and ((f.requester_id = r.user_a and f.addressee_id = r.user_b) or (f.requester_id = r.user_b and f.addressee_id = r.user_a)))
      and not exists (select 1 from blocks b
                   where (b.blocker_id = r.user_a and b.blocked_id = r.user_b) or (b.blocker_id = r.user_b and b.blocked_id = r.user_a))
  )
  select r.room_key, r.kind, r.post_id, r.dm_id, r.other_user, r.title, r.post_type, r.member_count,
         lm.body, lm.created_at, lm.sender_id, lm.system,
         (select count(*)::int from messages m
           where (m.post_id = r.post_id or m.dm_id = r.dm_id)
             and m.created_at >= r.since and not m.system and m.sender_id is distinct from auth.uid()
             and m.created_at > coalesce((select rr.last_read_at from room_reads rr
                                           where rr.user_id = auth.uid() and rr.room_key = r.room_key), '-infinity'))
  from rooms r
  left join lateral (
    select m.body, m.created_at, m.sender_id, m.system from messages m
    where (m.post_id = r.post_id or m.dm_id = r.dm_id) and m.created_at >= r.since
    order by m.id desc limit 1
  ) lm on true
  order by coalesce(lm.created_at, r.since) desc
$$;

-- ───────────────────────── 친구 ─────────────────────────
create function public.open_dm(p_user uuid) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); a uuid; b uuid; rid bigint;
begin
  if not exists (select 1 from public.friendships f where f.status = 'accepted'
                  and ((f.requester_id = v and f.addressee_id = p_user) or (f.requester_id = p_user and f.addressee_id = v))) then
    raise exception 'NOT_FRIENDS';
  end if;
  if public.is_blocked_pair(v, p_user) then raise exception 'BLOCKED'; end if;
  a := least(v, p_user); b := greatest(v, p_user);
  insert into public.dm_rooms (user_a, user_b) values (a, b) on conflict (user_a, user_b) do nothing;
  select id into rid from public.dm_rooms where user_a = a and user_b = b;
  return rid;
end $$;

create function public.request_friend(p_target uuid) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); f public.friendships;
begin
  if p_target = v then raise exception 'SELF'; end if;
  if not exists (select 1 from public.profiles where id = p_target and school_id = public.my_school() and not suspended) then
    raise exception 'USER_NOT_FOUND';
  end if;
  if public.is_blocked_pair(v, p_target) then raise exception 'BLOCKED'; end if;

  select * into f from public.friendships
   where (requester_id = v and addressee_id = p_target) or (requester_id = p_target and addressee_id = v);
  if found then
    if f.status = 'accepted' then raise exception 'ALREADY_FRIENDS'; end if;
    if f.requester_id = v then raise exception 'ALREADY_REQUESTED'; end if;
    perform public.respond_friend(f.id, true);        -- 상대가 먼저 보낸 요청이 있으면 바로 수락
    return;
  end if;
  if (select count(*) from public.friendships where requester_id = v and status = 'pending') >= 20 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  insert into public.friendships (requester_id, addressee_id) values (v, p_target);
  perform public.push_notification(p_target, 'friend_request', public.nick_of(v) || '님이 친구 요청을 보냈어요.', null, v);
end $$;

create function public.respond_friend(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); f public.friendships; rid bigint;
begin
  select * into f from public.friendships where id = p_id for update;
  if not found or f.addressee_id <> v or f.status <> 'pending' then raise exception 'REQUEST_NOT_FOUND'; end if;
  if not p_accept then
    delete from public.friendships where id = p_id;
    return;
  end if;
  update public.friendships set status = 'accepted', responded_at = now() where id = p_id;
  rid := public.open_dm(f.requester_id);
  insert into public.messages (dm_id, body, system) values (rid, '친구가 되었어요. 이제 1:1 채팅을 할 수 있어요.', true);
  perform public.push_notification(f.requester_id, 'friend_accepted', public.nick_of(v) || '님이 친구 요청을 수락했어요.', null, v);
end $$;

create function public.cancel_friend_request(p_id bigint) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  delete from public.friendships where id = p_id and requester_id = v and status = 'pending';
end $$;

create function public.remove_friend(p_user uuid) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  delete from public.friendships
   where status = 'accepted'
     and ((requester_id = v and addressee_id = p_user) or (requester_id = p_user and addressee_id = v));
end $$;

-- ───────────────────────── 차단 · 신고 ─────────────────────────
create function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  if p_user = v then raise exception 'SELF'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (v, p_user) on conflict do nothing;
  delete from public.friendships
   where (requester_id = v and addressee_id = p_user) or (requester_id = p_user and addressee_id = v);
end $$;

create function public.unblock_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  delete from public.blocks where blocker_id = v and blocked_id = p_user;
end $$;

-- 신고(security invoker): 내가 볼 수 있는 글·댓글·메시지만 신고할 수 있다.
create function public.report_content(
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
    t_user := coalesce(t_user, p.author_id); snap := p.title || ' / ' || p.description;
  end if;
  insert into public.reports (school_id, reporter_id, target_user, target_post, target_comment, target_message, reason, detail, snapshot)
  values (public.my_school(), v, t_user, p_post, p_comment, p_message, p_reason, coalesce(p_detail, ''), snap);
end $$;

-- ───────────────────────── 알림 ─────────────────────────
create function public.mark_notifications_read() returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  update public.notifications set read = true where user_id = v and not read;
end $$;

-- ───────────────────────── 운영자 ─────────────────────────
create function public.admin_resolve_report(p_id bigint, p_action text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); r public.reports;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into r from public.reports where id = p_id and school_id = public.my_school() for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if p_action not in ('dismiss', 'hide', 'suspend') then raise exception 'BAD_ACTION'; end if;

  if p_action in ('hide', 'suspend') then
    if r.target_post    is not null then update public.posts    set hidden = true where id = r.target_post; end if;
    if r.target_comment is not null then update public.comments set hidden = true where id = r.target_comment; end if;
    if r.target_message is not null then update public.messages set hidden = true where id = r.target_message; end if;
  end if;
  if p_action = 'suspend' and r.target_user is not null and r.target_user <> v then
    update public.profiles set suspended = true where id = r.target_user and school_id = r.school_id;
  end if;

  update public.reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         resolution = p_action || case when coalesce(p_note, '') = '' then '' else ': ' || p_note end,
         handled_by = v, handled_at = now()
   where id = p_id;
end $$;

create function public.admin_set_suspended(p_user uuid, p_flag boolean) returns void
language plpgsql security definer set search_path = '' as
$$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_user = auth.uid() then raise exception 'SELF'; end if;
  update public.profiles set suspended = p_flag where id = p_user and school_id = public.my_school();
end $$;

-- 채팅 보관 기간: 모임 종료(또는 취소) 후 7일이 지나면 메시지를 삭제한다. (pg_cron으로 매일 실행: README 참고)
create function public.purge_expired() returns int
language plpgsql security definer set search_path = '' as
$$
declare n int;
begin
  delete from public.messages m using public.posts p
   where m.post_id = p.id and least(coalesce(p.canceled_at, p.ends_at), p.ends_at) < now() - interval '7 days';
  get diagnostics n = row_count;
  delete from public.notifications where created_at < now() - interval '30 days';
  delete from public.room_reads r where r.room_key like 'p:%'
    and not exists (select 1 from public.posts p where 'p:' || p.id = r.room_key
                     and least(coalesce(p.canceled_at, p.ends_at), p.ends_at) >= now() - interval '7 days');
  return n;
end $$;

-- ───────────────────────── 함수 권한 ─────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
-- RLS가 쓰는 보조 함수와 클라이언트가 부르는 RPC만 로그인한 이용자에게 연다.
grant execute on function
  public.my_school(), public.is_active(), public.is_admin(), public.is_blocked_pair(uuid, uuid), public.require_active(),
  public.create_profile(text, public.gender_t, text), public.update_profile(text, public.gender_t, text), public.delete_account(),
  public.create_post(public.post_kind, text, text, timestamptz, timestamptz, text, text, text, int, text),
  public.join_post(bigint), public.leave_post(bigint), public.set_post_closed(bigint, boolean), public.cancel_post(bigint),
  public.update_post(bigint, timestamptz, timestamptz, text, text, int), public.add_comment(bigint, text),
  public.send_message(bigint, bigint, text), public.mark_read(text), public.my_rooms(),
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
    alter publication supabase_realtime add table
      public.posts, public.post_members, public.comments, public.messages, public.friendships, public.notifications;
  end if;
end $$;
