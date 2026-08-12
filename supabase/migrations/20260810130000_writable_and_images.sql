-- MeePick — 앱에서 게임을 추가·수정할 수 있게 하고, 표지 이미지 저장소를 만든다.

-- ── 1. 제목을 자연 키로 ────────────────────────────────────────────────────
-- 노션을 다시 내보내 임포트할 때 truncate 대신 upsert를 쓰기 위해 필요하다.
-- truncate 방식은 앱에서 추가한 게임과 플레이 기록(last_played_at)을 매번 날린다.
-- setup_all.sql을 다시 붙여넣어도 깨지지 않도록 존재 여부를 확인하고 추가한다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'games_title_ko_unique'
  ) then
    alter table public.games add constraint games_title_ko_unique unique (title_ko);
  end if;
end $$;

-- ── 2. 쓰기 개방 ───────────────────────────────────────────────────────────
-- 집에서 쓰는 앱이라 로그인을 두지 않는다. 대신 anon 키로 쓰기가 가능해진다는 뜻이고,
-- 이는 보안 경계가 아니다 — URL과 publishable 키를 아는 사람은 누구나 수정할 수 있다.
-- 앱을 외부에 배포하게 되면 Supabase Auth를 붙이고 아래 정책을 authenticated로 좁혀야 한다.
drop policy if exists games_anon_insert on public.games;
create policy games_anon_insert on public.games
  for insert with check (true);

drop policy if exists games_anon_update on public.games;
create policy games_anon_update on public.games
  for update using (true) with check (true);

drop policy if exists games_anon_delete on public.games;
create policy games_anon_delete on public.games
  for delete using (true);

-- ── 3. 저장소 경로는 별도 칼럼 ─────────────────────────────────────────────
-- image_file은 노션 원본 파일명(로컬 파일 매칭용)이고, image_path는 업로드된 객체 키다.
-- 한 칼럼에 두면 노션을 재임포트할 때 업로드 경로가 원본 파일명으로 덮어써진다.
alter table public.games
  add column if not exists image_path text;

-- ── 4. 표지 이미지 저장소 ──────────────────────────────────────────────────
-- 공개 버킷으로 둔다. 표지 이미지에 비밀이랄 게 없고, 공개면 CDN 캐시를 타서
-- 태블릿에서 목록을 스크롤할 때 매번 인증 요청을 하지 않는다.
insert into storage.buckets (id, name, public)
values ('game-images', 'game-images', true)
on conflict (id) do nothing;

-- 업로드는 로컬 스크립트가 secret 키로 수행한다(RLS 우회). 앱은 읽기만 한다.
drop policy if exists game_images_public_read on storage.objects;
create policy game_images_public_read on storage.objects
  for select using (bucket_id = 'game-images');
