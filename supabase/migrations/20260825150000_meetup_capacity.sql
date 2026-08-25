-- MeePick — 모임 정원
--
-- 보드게임은 자리 수가 곧 참여 인원이라 "몇 명까지"가 실제 제약이다.
-- 정원을 넘겨도 막지는 않는다 — 대기자를 사람이 조율하는 편이 자연스럽고,
-- 자동 마감은 "한 명만 더 끼자"가 안 되어 오히려 불편하다. 화면에 3/6처럼 보여주기만 한다.
alter table public.meetups
  add column if not exists capacity integer check (capacity is null or capacity > 0);
