-- 사진 메시지를 신고하면 운영자가 사진을 볼 수 있게 신고 기록에 사진 경로를 함께 남기고, 운영자는 사진을 읽을 수 있어요.
create policy chat_img_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.is_admin());

create or replace function public.report_content(
  p_reason text, p_detail text default '',
  p_user uuid default null, p_post bigint default null, p_comment bigint default null, p_message bigint default null
) returns void language plpgsql security invoker set search_path = '' as
$$
declare
  v uuid := public.require_active();
  t_user uuid := p_user;
  snap text := '';
  c public.comments; m public.messages; p public.posts;
begin
  if p_user is null and p_post is null and p_comment is null and p_message is null then raise exception 'NO_TARGET'; end if;
  if (select count(*) from public.reports where reporter_id = v and created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMIT';
  end if;
  if p_message is not null then
    select * into m from public.messages where id = p_message;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    t_user := coalesce(t_user, m.sender_id); snap := m.body || coalesce(' ' || m.image_path, '');
  elsif p_comment is not null then
    select * into c from public.comments where id = p_comment;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    t_user := coalesce(t_user, c.author_id); snap := c.body;
  elsif p_post is not null then
    select * into p from public.posts where id = p_post;
    if not found then raise exception 'TARGET_NOT_FOUND'; end if;
    t_user := coalesce(t_user, p.author_id); snap := p.title || ' / ' || p.body;
  end if;
  insert into public.reports (school_id, reporter_id, target_user, target_post, target_comment, target_message, reason, detail, snapshot)
  values (public.my_school(), v, t_user, p_post, p_comment, p_message, p_reason, coalesce(p_detail, ''), snap);
end $$;
