-- MeePick — 게시글을 모임 일정과 잇는다
--
-- 게임 연결(posts.game_id)은 처음부터 있었고, 여기서 일정 연결을 더한다.
-- "8월 정기모임에서 아그리콜라 했다"가 한 글에서 드러나야 나중에 모임별로 후기를 모을 수 있다.
-- 일정이 지워져도 글은 남는다(set null) — 후기가 일정에 딸린 부속물은 아니다.
alter table public.posts
  add column if not exists meetup_id uuid references public.meetups (id) on delete set null;

create index if not exists posts_meetup_idx on public.posts (meetup_id);

-- 프로필 한 줄 소개. 모임에서 서로를 알아보는 데 닉네임만으로는 부족하다.
alter table public.profiles
  add column if not exists bio text;
