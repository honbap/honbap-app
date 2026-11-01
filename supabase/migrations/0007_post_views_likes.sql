-- 글 조회수(사람 수 기준)와 글 좋아요. 테이블은 직접 못 읽고 아래 두 함수로만 다뤄요.
create table public.post_views (
  post_id    bigint not null references public.posts (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table public.post_likes (
  post_id    bigint not null references public.posts (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id);
create index post_views_user_idx on public.post_views (user_id);
alter table public.post_views enable row level security;
alter table public.post_likes enable row level security;
revoke all on public.post_views, public.post_likes from anon, authenticated;
create function public.view_post(p_id bigint)
returns table (views int, likes int, liked boolean)
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  if not exists (select 1 from public.posts p
                  where p.id = p_id and p.school_id = public.my_school() and not p.hidden
                    and not public.is_blocked_pair(v, p.author_id)) then
    raise exception 'POST_NOT_FOUND';
  end if;
  insert into public.post_views (post_id, user_id) values (p_id, v) on conflict do nothing;
  return query select (select count(*)::int from public.post_views where post_id = p_id),
                      (select count(*)::int from public.post_likes where post_id = p_id),
                      exists (select 1 from public.post_likes where post_id = p_id and user_id = v);
end $$;
create function public.toggle_post_like(p_id bigint)
returns table (views int, likes int, liked boolean)
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  if not exists (select 1 from public.posts p
                  where p.id = p_id and p.school_id = public.my_school() and not p.hidden
                    and not public.is_blocked_pair(v, p.author_id)) then
    raise exception 'POST_NOT_FOUND';
  end if;
  if exists (select 1 from public.post_likes where post_id = p_id and user_id = v) then
    delete from public.post_likes where post_id = p_id and user_id = v;
  else
    insert into public.post_likes (post_id, user_id) values (p_id, v);
  end if;
  return query select (select count(*)::int from public.post_views where post_id = p_id),
                      (select count(*)::int from public.post_likes where post_id = p_id),
                      exists (select 1 from public.post_likes where post_id = p_id and user_id = v);
end $$;
revoke execute on function public.view_post(bigint), public.toggle_post_like(bigint) from public, anon;
grant execute on function public.view_post(bigint), public.toggle_post_like(bigint) to authenticated;
