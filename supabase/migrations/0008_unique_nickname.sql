-- 닉네임은 학교와 상관없이 전체에서 하나만 쓸 수 있어요(대소문자 무시).
-- '운영자', '관리자', 'admin'이 들어간 닉네임은 운영자 계정만 쓸 수 있어요.
create unique index profiles_nickname_uq on public.profiles (lower(nickname));

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
  if p_nickname ~* '(운영|관리자|admin)' then raise exception 'NICKNAME_RESERVED'; end if;
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
  if p_nickname ~* '(운영|관리자|admin)' and not cur.is_admin then raise exception 'NICKNAME_RESERVED'; end if;
  if cur.nickname_changed_at is not null and cur.nickname_changed_at > now() - interval '7 days' then
    raise exception 'NICKNAME_COOLDOWN';
  end if;
  update public.profiles set nickname = p_nickname, nickname_changed_at = now() where id = v;
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;
