-- MeePick — 룰 설명 영상 (유튜브 링크).
-- 영상 파일을 직접 올리지 않는 이유: 룰 영상 150개면 수십 GB로 무료 저장소(1GB)를 즉시 넘고,
-- 시청 트래픽도 월 한도를 소모한다. 유튜브에 이미 있는 영상을 링크로 연결한다.

alter table public.games
  add column if not exists rule_video_url text;
