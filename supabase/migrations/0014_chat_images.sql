-- 채팅 사진: 사진 파일은 DB가 아니라 Storage(비공개 버킷 'chat')에 저장돼요. 파일은 1MB 이하 JPEG만 허용.
-- 사진은 그 메시지를 볼 수 있는 사람(채팅방 참여자)만 볼 수 있어요.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 1048576, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

alter table public.messages add column image_path text check (image_path is null or char_length(image_path) between 10 and 200);

create policy chat_img_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text);
create policy chat_img_select on storage.objects for select to authenticated
  using (bucket_id = 'chat' and (owner = auth.uid() or exists (select 1 from public.messages m where m.image_path = name)));
create policy chat_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and owner = auth.uid());

create function public.send_image(p_path text, p_dm_id bigint default null, p_post bigint default null) returns bigint
language plpgsql security definer set search_path = '' as
$$
declare v uuid := public.require_active(); new_id bigint;
begin
  if p_path is null or split_part(p_path, '/', 1) <> v::text or p_path !~ '^[0-9a-f-]{36}/[0-9A-Za-z._-]{1,80}\.jpg$' then raise exception 'BAD_MESSAGE'; end if;
  if (p_dm_id is not null)::int + (p_post is not null)::int <> 1 then raise exception 'ROOM_NOT_FOUND'; end if;
  if (select count(*) from public.messages where sender_id = v and image_path is not null and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'RATE_LIMIT';
  end if;
  if p_dm_id is not null then new_id := public.send_message(p_dm_id, '📷 사진');
  else new_id := public.send_group_message(p_post, '📷 사진'); end if;
  update public.messages set image_path = p_path where id = new_id;
  return new_id;
end $$;
revoke execute on function public.send_image(text, bigint, bigint) from public, anon;
grant execute on function public.send_image(text, bigint, bigint) to authenticated;
