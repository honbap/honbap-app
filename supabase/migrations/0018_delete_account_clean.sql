-- 탈퇴: 계정과 글·메시지·친구·알림이 함께 삭제된다. (신고 기록은 연결이 끊긴 채 남는다)
-- 사진 파일은 서버가 SQL 직접 삭제를 막으므로 앱이 탈퇴 전에 Storage API로 지운다.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as
$$
begin
  if auth.uid() is null then raise exception 'NOT_LOGGED_IN'; end if;
  delete from auth.users where id = auth.uid();
end $$;
