-- MeePick — 모임장이 일정도 관리한다
--
-- 일정은 글과 성격이 다르다. 남의 '말'을 고치는 건 위조지만, 일정은 모임 전체가 쓰는
-- 공용 정보라 만든 사람이 자리를 비우면 누군가는 시간·장소를 고칠 수 있어야 한다.
-- 그래서 일정은 수정까지, 게시글은 삭제만 모임장에게 연다.

drop policy if exists meetups_owner_update on public.meetups;
create policy meetups_owner_update on public.meetups
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists meetups_owner_delete on public.meetups;
create policy meetups_owner_delete on public.meetups
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());
