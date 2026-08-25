-- MeePick — 게임 하트(선호도)
--
-- 지금까지 게임 목록은 "집에 무엇이 있는가"만 말했다. 여기서부터 "누가 무엇을 하고
-- 싶어 하는가"가 붙는다. 소장 게임의 하트는 오늘 뭘 꺼낼지 고르는 힌트가 되고,
-- 위시리스트의 하트는 다음에 뭘 살지 정하는 투표가 된다. 성격이 같으니 테이블도 하나다.
--
-- 좋아요(posts)와 달리 카운트 캐시 칼럼을 두지 않는다. 게임은 150개 남짓이라
-- 한 번에 다 읽어도 부담이 없고, 캐시를 두면 그걸 맞춰 주는 트리거가 또 필요해진다.

create table if not exists public.game_likes (
  game_id    uuid        not null references public.games (id)    on delete cascade,
  profile_id uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

-- 게임별 집계가 주 질의다.
create index if not exists game_likes_game_idx on public.game_likes (game_id);

alter table public.game_likes enable row level security;

-- 게임 목록 자체가 공개(로그인 없이 링크로 자랑할 수 있다)이므로 하트 수도 공개로 둔다.
drop policy if exists game_likes_public_read on public.game_likes;
create policy game_likes_public_read on public.game_likes
  for select using (true);

-- 누르는 건 회원만, 그리고 자기 이름으로만. profile_id를 남의 것으로 넣는 시도는 막힌다.
drop policy if exists game_likes_insert on public.game_likes;
create policy game_likes_insert on public.game_likes
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_member());

drop policy if exists game_likes_delete on public.game_likes;
create policy game_likes_delete on public.game_likes
  for delete to authenticated
  using (profile_id = auth.uid());
