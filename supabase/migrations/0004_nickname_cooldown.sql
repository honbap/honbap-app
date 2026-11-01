-- 0004: 닉네임은 7일에 한 번만 바꿀 수 있다.
alter table public.profiles add column nickname_changed_at timestamptz;

create or replace function public.update_profile(p_nickname text)
returns void language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); cur public.profiles;
begin
  p_nickname := btrim(coalesce(p_nickname, ''));
  if p_nickname !~ '^[0-9A-Za-z가-힣_]{2,10}$' then raise exception 'BAD_NICKNAME'; end if;
  select * into cur from public.profiles where id = v;
  if cur.nickname = p_nickname then return; end if;
  if cur.nickname_changed_at is not null and cur.nickname_changed_at > now() - interval '7 days' then
    raise exception 'NICKNAME_COOLDOWN';
  end if;
  update public.profiles set nickname = p_nickname, nickname_changed_at = now() where id = v;
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;
