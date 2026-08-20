-- MeePick — 외부 공개를 위한 쓰기 잠금.
-- 조회는 계속 공개(링크만 있으면 보임), 쓰기는 로그인(공용 계정 1개)으로 좁힌다.
-- 지금까지는 집 LAN에서만 서빙해 anon 쓰기를 열어 뒀다 — 그 전제가 끝나는 마이그레이션이다.
--
-- 반드시 함께 할 것 (SUPABASE_SETUP.md 8단계):
--   1) 대시보드 → Authentication → Users 에서 공용 계정 1개 생성 (Auto Confirm)
--   2) 대시보드 → Authentication → Sign In/Providers 에서 "Allow new users to sign up" 끄기
--      — 가입이 열려 있으면 anon 키로 누구나 계정을 만들어 authenticated가 되므로
--        이 잠금이 무의미해진다.

-- ── games: anon 쓰기 정책 → authenticated ──────────────────────────────────
drop policy if exists games_anon_insert on public.games;
drop policy if exists games_anon_update on public.games;
drop policy if exists games_anon_delete on public.games;

drop policy if exists games_auth_insert on public.games;
create policy games_auth_insert on public.games
  for insert to authenticated with check (true);

drop policy if exists games_auth_update on public.games;
create policy games_auth_update on public.games
  for update to authenticated using (true) with check (true);

drop policy if exists games_auth_delete on public.games;
create policy games_auth_delete on public.games
  for delete to authenticated using (true);

-- games_public_read(select)는 그대로 둔다 — 조회 공개.

-- ── members: 전체 개방 → 조회 공개 + 쓰기 인증 ─────────────────────────────
drop policy if exists members_anon_all on public.members;

drop policy if exists members_public_read on public.members;
create policy members_public_read on public.members
  for select using (true);

drop policy if exists members_auth_insert on public.members;
create policy members_auth_insert on public.members
  for insert to authenticated with check (true);

drop policy if exists members_auth_update on public.members;
create policy members_auth_update on public.members
  for update to authenticated using (true) with check (true);

drop policy if exists members_auth_delete on public.members;
create policy members_auth_delete on public.members
  for delete to authenticated using (true);

-- ── plays: 전체 개방 → 조회 공개 + 쓰기 인증 ───────────────────────────────
drop policy if exists plays_anon_all on public.plays;

drop policy if exists plays_public_read on public.plays;
create policy plays_public_read on public.plays
  for select using (true);

drop policy if exists plays_auth_insert on public.plays;
create policy plays_auth_insert on public.plays
  for insert to authenticated with check (true);

drop policy if exists plays_auth_update on public.plays;
create policy plays_auth_update on public.plays
  for update to authenticated using (true) with check (true);

drop policy if exists plays_auth_delete on public.plays;
create policy plays_auth_delete on public.plays
  for delete to authenticated using (true);

-- ── 쓰기 RPC: anon 실행 권한 회수 ──────────────────────────────────────────
-- 셋 다 security definer라 RLS를 우회한다. anon에 남겨 두면 테이블 정책이 무의미하다.
revoke execute on function public.mark_played(uuid, date) from anon;
revoke execute on function public.end_play(uuid, text, date) from anon;
revoke execute on function public.log_play(uuid, uuid[], date) from anon;

-- 표지 이미지 버킷(game-images)은 공개 유지 — 비밀이 없는 데이터이고 CDN 캐시를 탄다.
-- 업로드는 원래부터 로컬 스크립트가 secret 키로만 한다.
