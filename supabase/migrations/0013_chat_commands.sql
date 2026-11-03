-- 채팅 명령어: @성별(내 성별 보여주기), @주사위(1~6 중 하나). 서버가 직접 만들어서 위조할 수 없어요.
alter table public.messages add column special text check (special in ('dice', 'gender'));

create function public.send_special(p_kind text, p_dm_id bigint default null, p_post bigint default null) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare
  v uuid := public.require_active();
  body text;
  g public.gender_t;
  new_id bigint;
begin
  if p_kind not in ('dice', 'gender') then raise exception 'BAD_MESSAGE'; end if;
  if (p_dm_id is not null)::int + (p_post is not null)::int <> 1 then raise exception 'ROOM_NOT_FOUND'; end if;
  if p_kind = 'dice' then
    body := '🎲 주사위 ' || (1 + floor(random() * 6))::int;
  else
    select gender into g from public.profiles where id = v;
    body := '🙋 성별: ' || g::text;
  end if;
  if p_dm_id is not null then new_id := public.send_message(p_dm_id, body);
  else new_id := public.send_group_message(p_post, body); end if;
  update public.messages set special = p_kind where id = new_id;
  return new_id;
end $$;
revoke execute on function public.send_special(text, bigint, bigint) from public, anon;
grant execute on function public.send_special(text, bigint, bigint) to authenticated;
