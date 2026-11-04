-- 탈퇴 시 올려 둔 사진 파일도 함께 지운다. (프로필·글·댓글·메시지·친구·알림은 계정 삭제와 함께 지워짐)
-- 신고 기록은 안전 확인용으로 남지만 신고자·대상 연결은 끊어져 누구인지 알 수 없다.
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as
$$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'NOT_LOGGED_IN'; end if;
  delete from storage.objects where bucket_id = 'chat' and name like v::text || '/%';
  delete from auth.users where id = v;
end $$;
