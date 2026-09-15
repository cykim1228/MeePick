-- MeePick — 위시리스트는 회원 누구나, 소장 목록은 모임장만
--
-- 앞선 마이그레이션은 게임 쓰기를 통째로 모임장에게 묶었다. 그런데 두 목록의 성격이 다르다:
--   소장 목록  집에 실제로 있는 것. 모임의 공용 자산이라 아무나 고치면 곤란하다.
--   위시리스트 "이거 사고 싶다"는 **의견**. 의견을 내는 데 허락이 필요하면 아무도 안 낸다.
--
-- 그래서 회원은 `owned = false`인 행만 **추가**할 수 있다. 수정·삭제는 그대로 모임장 몫이라,
-- 남이 올린 게임을 지우거나 소장으로 바꾸는 일은 일어나지 않는다.
--
-- 소장으로 옮기는 것도 모임장만 할 수 있다 — update 정책이 그대로이기 때문이다.
-- (실제로 샀는지 아는 사람은 한 명뿐이다.)

drop policy if exists games_auth_insert on public.games;
create policy games_auth_insert on public.games
  for insert to authenticated
  with check (
    public.is_admin()
    -- 회원이 넣을 수 있는 건 위시리스트 행뿐이다. owned를 true로 넣으려 하면 막힌다.
    or (public.is_member() and owned = false)
  );
