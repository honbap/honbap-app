-- 사진과 함께 글도 보낼 수 있게: send_image에 선택 입력 p_body(없으면 '📷 사진')
drop function if exists public.send_image(text, bigint, bigint);
create function public.send_image(p_path text, p_dm_id bigint default null, p_post bigint default null, p_body text default null) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); new_id bigint; b text := coalesce(nullif(btrim(coalesce(p_body, '')), ''), '📷 사진');
begin
  if p_path is null or split_part(p_path, '/', 1) <> v::text or p_path !~ '^[0-9a-f-]{36}/[0-9A-Za-z._-]{1,80}\.jpg$' then raise exception 'BAD_MESSAGE'; end if;
  if (p_dm_id is not null)::int + (p_post is not null)::int <> 1 then raise exception 'ROOM_NOT_FOUND'; end if;
  if (select count(*) from public.messages where sender_id = v and image_path is not null and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'RATE_LIMIT';
  end if;
  if p_dm_id is not null then new_id := public.send_message(p_dm_id, b);
  else new_id := public.send_group_message(p_post, b); end if;
  update public.messages set image_path = p_path where id = new_id;
  return new_id;
end $$;
revoke execute on function public.send_image(text, bigint, bigint, text) from public, anon;
grant execute on function public.send_image(text, bigint, bigint, text) to authenticated;
