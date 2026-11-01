-- 단체 채팅 읽음 표시: 같은 모임 참여자끼리는 서로의 마지막 읽은 시각을 볼 수 있어요.
create policy room_reads_group on public.room_reads for select to authenticated
  using (
    room_key like 'p:%'
    and exists (
      select 1 from public.post_members me
      join public.post_members o on o.post_id = me.post_id
      where me.user_id = auth.uid() and o.user_id = room_reads.user_id
        and 'p:' || me.post_id = room_reads.room_key
    )
  );
