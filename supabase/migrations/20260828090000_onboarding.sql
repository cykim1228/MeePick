-- MeePick — 처음 온 사람에게 할 일 하나 쥐어 준다
--
-- 가입 직후 피드는 대개 비어 있거나 남의 이야기뿐이라 "그래서 뭘 하지"가 된다.
-- 좋아하는 게임에 하트를 몇 개 눌러 두면 그날부터 추천이 그 사람에게 맞기 시작하므로,
-- 첫 화면에서 그것만 물어본다. 건너뛰어도 그만이다 — 강요할 일이 아니다.
--
-- '봤는가'를 기기(로컬 저장소)가 아니라 계정에 적는 이유: 폰에서 건너뛴 사람이
-- 태블릿에서 또 만나면 그건 안내가 아니라 방해다.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- 이미 쓰고 있는 회원에게는 띄우지 않는다. 지금 시점을 기준으로 한 번만 채운다.
update public.profiles set onboarded_at = now() where onboarded_at is null;
