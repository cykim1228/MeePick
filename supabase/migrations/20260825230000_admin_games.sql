-- MeePick — 게임 목록 수정은 모임장만, 운영 계정은 참석 명단에서 숨김

-- ── 1. 게임 추가·수정·삭제를 모임장으로 좁힌다 ────────────────────────────
-- 소장 목록은 모임의 공용 자산이라 아무나 고치면 곤란하다. 조회는 그대로 공개다.
-- (플레이 기록은 계속 회원 누구나 남길 수 있다 — 그건 각자의 활동이다.)
drop policy if exists games_auth_insert on public.games;
create policy games_auth_insert on public.games
  for insert to authenticated with check (public.is_admin());

drop policy if exists games_auth_update on public.games;
create policy games_auth_update on public.games
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists games_auth_delete on public.games;
create policy games_auth_delete on public.games
  for delete to authenticated using (public.is_admin());

-- ── 2. 명단에서 숨기는 멤버 ───────────────────────────────────────────────
-- 모임장 계정은 운영용이지 실제로 게임을 하는 사람이 아니다.
-- 아이디는 저장소에 적지 않는다 — 실행 전에 CHANGE-ME를 실제 아이디로 바꾼다.
-- 행을 지우지 않고 숨기는 이유: 이미 어떤 판에 참가자로 들어가 있으면 지우는 순간
-- 그 기록의 참가자가 유령 id가 된다. 숨기면 이름 조회는 그대로 되고 목록에서만 빠진다.
alter table public.members
  add column if not exists hidden boolean not null default false;

update public.members m
   set hidden = true
  from public.profiles p
 where m.profile_id = p.id and p.handle = 'CHANGE-ME';
