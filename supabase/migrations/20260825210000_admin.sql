-- MeePick — 관리자
--
-- 모임장이 남의 글을 지우거나 회원을 내보낼 수 있어야 한다. 지금까지는 작성자 본인만
-- 지울 수 있어서, 누가 잘못 올리고 자리를 비우면 손댈 방법이 없었다.
--
-- 관리자는 사람이 아니라 '권한 플래그'다. handle로 하드코딩하지 않는 이유:
-- 나중에 관리자를 늘리거나 넘길 때 코드를 고치는 게 아니라 데이터만 바꾸면 된다.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- 모임장 계정을 관리자로. 여기 없는 계정은 전부 일반 회원이다.
-- 아이디는 저장소에 적지 않는다(공개 저장소다). 실행 전에 CHANGE-ME를 실제 아이디로 바꾼다.
update public.profiles set is_admin = true where handle = 'CHANGE-ME';

/**
 * 정책에서 관리자인지 판단한다.
 * is_member()와 같은 이유로 security definer — 정책 안에서 profiles를 직접 읽으면
 * profiles 정책이 다시 평가되며 무한 재귀에 빠진다.
 */
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

-- ── 글·댓글: 관리자도 지울 수 있다 ────────────────────────────────────────
drop policy if exists posts_author_delete on public.posts;
create policy posts_author_delete on public.posts
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

drop policy if exists comments_author_delete on public.post_comments;
create policy comments_author_delete on public.post_comments
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- ── 회원 내보내기 ─────────────────────────────────────────────────────────
-- 프로필을 지우면 그 사람이 쓴 글·댓글·좋아요·참석 응답이 함께 사라지고(cascade),
-- 플레이 멤버 행은 남되 연결만 끊긴다(members.profile_id는 set null) —
-- 지난 게임 기록과 통계는 사람이 나가도 보존되어야 하기 때문이다.
--
-- 계정 자체(auth.users)는 남는다. 다시 참여 코드를 넣으면 회원으로 돌아올 수 있다.
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete to authenticated using (public.is_admin() and id <> auth.uid());

-- 관리자 지정·해제도 관리자만. 스스로에게서 관리자를 뗄 수는 있게 둔다(넘겨주는 경우).
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
