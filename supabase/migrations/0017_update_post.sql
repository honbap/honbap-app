-- 글 수정: 작성자 본인만, 제목·내용·시간·정원을 바꿀 수 있어요. (종류·학교는 그대로)
create or replace function public.update_post(
  p_id bigint, p_title text, p_body text,
  p_starts timestamptz default null, p_ends timestamptz default null, p_capacity int default 4
) returns void
language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active();
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  cur public.posts;
  mc int;
begin
  select * into cur from public.posts where id = p_id and author_id = v and not hidden;
  if not found then raise exception 'NOT_AUTHOR'; end if;
  if char_length(t) not between 1 and 40 then raise exception 'BAD_TITLE'; end if;
  if char_length(b) not between 1 and 1000 then raise exception 'BAD_BODY'; end if;
  if public.has_banned_word(t) or public.has_banned_word(b) then raise exception 'BAD_CONTENT'; end if;
  if p_capacity is null or p_capacity not between 2 and 10 then raise exception 'BAD_CAPACITY'; end if;
  select count(*)::int into mc from public.post_members where post_id = p_id;
  if p_capacity < mc then raise exception 'BAD_CAPACITY'; end if;
  if p_ends is not null and p_starts is null then raise exception 'BAD_TIME'; end if;
  if p_starts is not null then
    -- 시간을 바꾸지 않았다면 이미 지난 시간도 그대로 둘 수 있어요
    if p_starts is distinct from cur.starts_at and (p_starts < now() - interval '1 hour' or p_starts > now() + interval '60 days') then
      raise exception 'BAD_TIME';
    end if;
    if p_ends is not null and (p_ends <= p_starts or p_ends > p_starts + interval '12 hours') then raise exception 'BAD_TIME'; end if;
  end if;
  update public.posts set title = t, body = b, starts_at = p_starts, ends_at = p_ends, capacity = p_capacity where id = p_id;
end $$;
revoke execute on function public.update_post(bigint, text, text, timestamptz, timestamptz, int) from public, anon;
grant execute on function public.update_post(bigint, text, text, timestamptz, timestamptz, int) to authenticated;
