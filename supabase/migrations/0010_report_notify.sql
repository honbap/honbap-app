-- 새 신고가 들어오면 같은 학교 운영자에게 알림을 보내요. (알림은 앱 상단에 떠요)
create function public.notify_admins_of_report() returns trigger
language plpgsql security definer set search_path = '' as
$$
begin
  insert into public.notifications (user_id, kind, body)
  select p.id, 'report', '새 신고가 들어왔어요. 운영자 화면에서 확인해 주세요.'
  from public.profiles p
  where p.is_admin and p.school_id = new.school_id and p.id <> new.reporter_id;
  return new;
end $$;
revoke execute on function public.notify_admins_of_report() from public, anon, authenticated;
create trigger reports_notify_admins after insert on public.reports
  for each row execute function public.notify_admins_of_report();
