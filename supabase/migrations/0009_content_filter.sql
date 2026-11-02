-- 부적절한 표현 걸러내기: 금지어 목록(운영자가 SQL로 추가·삭제)과 검사 함수.
-- 공백·점·밑줄 등을 빼고 비교해서 단순한 띄어쓰기 우회를 막아요. (완벽한 필터는 아니에요. 신고·운영자 조치와 함께 써요.)
create table public.banned_words (
  word text primary key check (char_length(word) between 1 and 20)
);
alter table public.banned_words enable row level security;
revoke all on public.banned_words from anon, authenticated;
insert into public.banned_words (word) values
  ('시발'), ('씨발'), ('시팔'), ('씨팔'), ('병신'), ('개새끼'), ('좆'), ('지랄'), ('느금마'), ('섹스'), ('성매매'), ('조건만남'), ('자살방법')
on conflict do nothing;

create function public.has_banned_word(p_text text) returns boolean
language sql stable security definer set search_path = '' as
$$
  select exists (
    select 1 from public.banned_words w
    where position(w.word in regexp_replace(lower(coalesce(p_text, '')), '[\s.\-_*~!?,]+', '', 'g')) > 0
  )
$$;
revoke execute on function public.has_banned_word(text) from public, anon, authenticated;

create or replace function public.create_post(
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
  if public.has_banned_word(t) or public.has_banned_word(b) then raise exception 'BAD_CONTENT'; end if;
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

create or replace function public.send_message(p_dm_id bigint, p_body text) returns bigint
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
  if public.has_banned_word(body) then raise exception 'BAD_CONTENT'; end if;
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

create or replace function public.send_group_message(p_post bigint, p_body text) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); body text := btrim(coalesce(p_body, '')); new_id bigint;
begin
  if char_length(body) not between 1 and 500 then raise exception 'BAD_MESSAGE'; end if;
  if public.has_banned_word(body) then raise exception 'BAD_CONTENT'; end if;
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

create or replace function public.create_profile(p_nickname text, p_gender public.gender_t, p_school int, p_agreed boolean default false)
returns void language plpgsql security definer set search_path = '' as
$$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'NOT_LOGGED_IN'; end if;
  if exists (select 1 from public.profiles where id = v) then raise exception 'PROFILE_EXISTS'; end if;
  if not coalesce(p_agreed, false) then raise exception 'TERMS_REQUIRED'; end if;
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  if p_nickname ~* '(운영|관리자|admin)' or public.has_banned_word(p_nickname) then raise exception 'NICKNAME_RESERVED'; end if;
  if p_gender is null or p_gender not in ('남성', '여성') then raise exception 'BAD_GENDER'; end if;
  if not exists (select 1 from public.schools where id = p_school) then raise exception 'BAD_SCHOOL'; end if;
  insert into public.profiles (id, school_id, nickname, gender, terms_agreed_at, terms_version)
  values (v, p_school, p_nickname, p_gender, now(), '2026-11-01');
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;

create or replace function public.update_profile(p_nickname text)
returns void language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); cur public.profiles;
begin
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  select * into cur from public.profiles where id = v;
  if cur.nickname = p_nickname then return; end if;
  if (p_nickname ~* '(운영|관리자|admin)' and not cur.is_admin) or public.has_banned_word(p_nickname) then raise exception 'NICKNAME_RESERVED'; end if;
  if cur.nickname_changed_at is not null and cur.nickname_changed_at > now() - interval '7 days' then
    raise exception 'NICKNAME_COOLDOWN';
  end if;
  update public.profiles set nickname = p_nickname, nickname_changed_at = now() where id = v;
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;
