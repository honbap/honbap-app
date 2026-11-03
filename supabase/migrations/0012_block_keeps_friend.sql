-- 차단해도 친구 관계는 지우지 않아요. 차단을 풀면 친구와 채팅방이 그대로 돌아와요.
-- (차단 중에는 채팅 목록에서 숨겨지고, 메시지·친구 요청은 BLOCKED로 막혀요.)
create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active();
begin
  if p_user = v then raise exception 'SELF'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (v, p_user) on conflict do nothing;
end $$;
