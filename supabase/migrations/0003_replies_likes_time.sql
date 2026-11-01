-- 0003: 대댓글, 댓글 좋아요, 글의 모이는 시간(선택), 학교는 한 번 정하면 변경 불가
-- 0002가 적용된 DB 위에서 실행한다.

-- ───────────────────────── 학교 변경 막기 ─────────────────────────
drop function if exists public.update_profile(text, int);
create function public.update_profile(p_nickname text)
returns void language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  update public.profiles set nickname = p_nickname where id = v;
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;

-- ───────────────────────── 글: 모이는 시간(선택) ─────────────────────────
drop view if exists public.post_feed;
alter table public.posts add column starts_at timestamptz, add column ends_at timestamptz;
alter table public.posts add constraint posts_time_check
  check (ends_at is null or (starts_at is not null and ends_at > starts_at));

create view public.post_feed with (security_invoker = true) as
select p.*, (select count(*)::int from public.comments c where c.post_id = p.id) as comment_count
from public.posts p;
revoke all on public.post_feed from anon, authenticated;
grant select on public.post_feed to authenticated;

drop function if exists public.create_post(public.post_kind, text, text);
create function public.create_post(
  p_kind public.post_kind, p_title text, p_body text,
  p_starts timestamptz default null, p_ends timestamptz default null
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
  if p_ends is not null and p_starts is null then raise exception 'BAD_TIME'; end if;
  if p_starts is not null then
    if p_starts < now() - interval '1 hour' or p_starts > now() + interval '60 days' then raise exception 'BAD_TIME'; end if;
    if p_ends is not null and (p_ends <= p_starts or p_ends > p_starts + interval '12 hours') then raise exception 'BAD_TIME'; end if;
  end if;
  if (select count(*) from public.posts where author_id = v and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.posts (school_id, author_id, kind, title, body, starts_at, ends_at)
  values (public.my_school(), v, p_kind, t, b, p_starts, p_ends) returning id into new_id;
  return new_id;
end $$;

-- ───────────────────────── 대댓글 ─────────────────────────
alter table public.comments add column parent_id bigint references public.comments (id) on delete cascade;
create index comments_parent_idx on public.comments (parent_id);

drop function if exists public.add_comment(bigint, text);
create function public.add_comment(p_post bigint, p_body text, p_parent bigint default null) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active(); new_id bigint; p public.posts; par public.comments;
  b text := btrim(coalesce(p_body, ''));
begin
  if char_length(b) not between 1 and 200 then raise exception 'BAD_COMMENT'; end if;
  select * into p from public.posts
   where id = p_post and school_id = public.my_school() and not hidden and not public.is_blocked_pair(v, author_id);
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if p_parent is not null then
    select * into par from public.comments where id = p_parent and post_id = p_post and not hidden;
    if not found then raise exception 'COMMENT_NOT_FOUND'; end if;
    if par.parent_id is not null then raise exception 'REPLY_TOO_DEEP'; end if;   -- 답글에는 답글을 달 수 없다(한 단계만)
    if public.is_blocked_pair(v, par.author_id) then raise exception 'BLOCKED'; end if;
  end if;
  if (select count(*) from public.comments where author_id = v and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.comments (post_id, author_id, body, parent_id) values (p_post, v, b, p_parent) returning id into new_id;
  if p.author_id <> v then
    perform public.push_notification(p.author_id, 'comment', public.nick_of(v) || '님이 「' || p.title || '」에 댓글을 남겼어요.', p_post, v);
  end if;
  if p_parent is not null and par.author_id <> v and par.author_id <> p.author_id then
    perform public.push_notification(par.author_id, 'reply', public.nick_of(v) || '님이 내 댓글에 답글을 남겼어요.', p_post, v);
  end if;
  return new_id;
end $$;

-- ───────────────────────── 댓글 좋아요 ─────────────────────────
create table public.comment_likes (
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_likes_user_idx on public.comment_likes (user_id);
alter table public.comment_likes enable row level security;
create policy comment_likes_read on public.comment_likes for select to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_likes.comment_id));   -- 볼 수 있는 댓글의 좋아요만
revoke all on public.comment_likes from anon, authenticated;
grant select on public.comment_likes to authenticated;

-- 누르면 좋아요, 다시 누르면 취소. 지금 좋아요 상태(true/false)를 돌려준다.
create function public.toggle_like(p_comment bigint) returns boolean
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); c public.comments;
begin
  select cm.* into c from public.comments cm join public.posts p on p.id = cm.post_id
   where cm.id = p_comment and not cm.hidden and p.school_id = public.my_school() and not p.hidden
     and not public.is_blocked_pair(v, cm.author_id);
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;
  if exists (select 1 from public.comment_likes where comment_id = p_comment and user_id = v) then
    delete from public.comment_likes where comment_id = p_comment and user_id = v;
    return false;
  end if;
  insert into public.comment_likes (comment_id, user_id) values (p_comment, v);
  return true;
end $$;

-- ───────────────────────── 권한 · 실시간 ─────────────────────────
grant execute on function
  public.update_profile(text),
  public.create_post(public.post_kind, text, text, timestamptz, timestamptz),
  public.add_comment(bigint, text, bigint),
  public.toggle_like(bigint)
to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.comment_likes;
  end if;
end $$;
