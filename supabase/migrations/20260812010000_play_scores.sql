-- MeePick — 개인 점수.
-- 판 단위로 { member_id: 점수 } 를 남긴다. 게임별 최고 기록과 개인 점수 순위의 근거.
-- 라운드별 메모는 rounds jsonb 항목({winnerIds, coop, memo})에 들어가므로 스키마 변경이 없다.

alter table public.plays
  add column if not exists scores jsonb not null default '{}'::jsonb;
