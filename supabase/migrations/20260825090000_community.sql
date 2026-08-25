-- MeePick — 모임 커뮤니티 (회원·게시글·모임 일정)
--
-- 지금까지는 "집에서 쓰는 앱 + 공용 계정 1개"였다. 여기서부터는 모임 사람들이
-- 각자 계정으로 들어와 글을 쓰고 일정을 잡는다. 그래서 두 가지가 바뀐다:
--
--   1) 가입을 열되(대시보드에서 Allow signups 켜기), **가입만으로는 아무것도 못 한다.**
--      초대 코드를 써서 profiles 행이 생겨야 비로소 '회원'이다.
--      가입이 열린 인터넷에서 아무나 계정을 만들어도 빈손으로 남는다.
--   2) 모임 콘텐츠(글·댓글·일정)는 **회원만 읽을 수 있다.**
--      게임 목록은 지금처럼 공개로 둔다 — 링크로 자랑할 수 있어야 한다.

-- ── 회원 ───────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  -- 로그인 아이디와 같은 값. 앱은 <handle>@meepick.local로 인증한다(src/lib/auth.ts).
  handle       text not null unique,
  display_name text not null,
  avatar_path  text,
  created_at   timestamptz not null default now()
);

/**
 * 정책에서 "이 사람이 회원인가"를 판단한다.
 * security definer인 이유: 정책 안에서 profiles를 직접 select하면
 * profiles의 정책이 다시 평가되며 무한 재귀에 빠진다.
 */
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

alter table public.profiles enable row level security;

-- 회원끼리는 서로를 본다. 비회원에게는 명단이 보이지 않는다.
drop policy if exists profiles_member_read on public.profiles;
create policy profiles_member_read on public.profiles
  for select to authenticated using (public.is_member());

-- 프로필 생성은 redeem_invite()만 한다(아래). 직접 insert는 열지 않는다.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── 초대 코드 ──────────────────────────────────────────────────────────────
create table if not exists public.invite_codes (
  code       text primary key,
  created_by uuid references public.profiles (id) on delete set null,
  used_by    uuid references public.profiles (id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

-- 회원만 코드 목록을 본다(누구를 초대했는지). 비회원은 코드의 존재조차 모른다 —
-- 읽기를 열면 코드를 통째로 긁어 가입할 수 있다.
drop policy if exists invites_member_read on public.invite_codes;
create policy invites_member_read on public.invite_codes
  for select to authenticated using (public.is_member());

drop policy if exists invites_member_insert on public.invite_codes;
create policy invites_member_insert on public.invite_codes
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());

/**
 * 초대 코드를 쓰고 회원이 된다. 로그인은 되어 있지만 아직 profiles 행이 없는 상태에서 부른다.
 * security definer로 RLS를 우회하는 대신, 코드 유효성과 중복 가입을 여기서 직접 막는다.
 */
create or replace function public.redeem_invite(
  p_code text,
  p_display_name text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_handle text;
  v_code   public.invite_codes;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception '이미 가입된 회원입니다.';
  end if;

  -- 동시에 같은 코드를 쓰면 한 명만 통과해야 한다. 행을 잠그고 확인한다.
  select * into v_code from public.invite_codes
   where code = upper(btrim(p_code)) for update;

  if v_code.code is null then
    raise exception '초대 코드가 올바르지 않습니다.';
  end if;
  if v_code.used_by is not null then
    raise exception '이미 사용된 초대 코드입니다.';
  end if;

  -- 아이디는 로그인 이메일의 앞부분이다(앱이 <아이디>@meepick.local로 가입시킨다).
  select split_part(email, '@', 1) into v_handle from auth.users where id = v_uid;

  insert into public.profiles (id, handle, display_name)
  values (v_uid, v_handle, coalesce(nullif(btrim(p_display_name), ''), v_handle))
  returning * into v_profile;

  update public.invite_codes
     set used_by = v_uid, used_at = now()
   where code = v_code.code;

  return v_profile;
end;
$$;

revoke all on function public.redeem_invite(text, text) from public;
grant execute on function public.redeem_invite(text, text) to authenticated;

-- ── 게시글 ─────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null default '',
  -- 이미지 경로만 담는다. 저장소(지금은 Supabase, 나중에 NAS)가 바뀌어도 DB는 그대로다.
  image_paths text[] not null default '{}',
  -- 모임 사진을 특정 게임과 엮을 수 있다. 게임이 지워져도 글은 남는다.
  game_id    uuid references public.games (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_not_empty check (body <> '' or array_length(image_paths, 1) > 0)
);

create index if not exists posts_created_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

drop policy if exists posts_member_read on public.posts;
create policy posts_member_read on public.posts
  for select to authenticated using (public.is_member());

drop policy if exists posts_author_insert on public.posts;
create policy posts_author_insert on public.posts
  for insert to authenticated with check (public.is_member() and author_id = auth.uid());

drop policy if exists posts_author_update on public.posts;
create policy posts_author_update on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists posts_author_delete on public.posts;
create policy posts_author_delete on public.posts
  for delete to authenticated using (author_id = auth.uid());

-- ── 좋아요 ─────────────────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

drop policy if exists likes_member_read on public.post_likes;
create policy likes_member_read on public.post_likes
  for select to authenticated using (public.is_member());

drop policy if exists likes_self_insert on public.post_likes;
create policy likes_self_insert on public.post_likes
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());

drop policy if exists likes_self_delete on public.post_likes;
create policy likes_self_delete on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

-- ── 댓글 ───────────────────────────────────────────────────────────────────
create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

drop policy if exists comments_member_read on public.post_comments;
create policy comments_member_read on public.post_comments
  for select to authenticated using (public.is_member());

drop policy if exists comments_author_insert on public.post_comments;
create policy comments_author_insert on public.post_comments
  for insert to authenticated with check (public.is_member() and author_id = auth.uid());

drop policy if exists comments_author_delete on public.post_comments;
create policy comments_author_delete on public.post_comments
  for delete to authenticated using (author_id = auth.uid());

-- ── 모임 일정 ──────────────────────────────────────────────────────────────
create table if not exists public.meetups (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  starts_at  timestamptz not null,
  place      text,
  memo       text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists meetups_starts_idx on public.meetups (starts_at desc);

alter table public.meetups enable row level security;

drop policy if exists meetups_member_read on public.meetups;
create policy meetups_member_read on public.meetups
  for select to authenticated using (public.is_member());

drop policy if exists meetups_member_insert on public.meetups;
create policy meetups_member_insert on public.meetups
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());

-- 일정은 만든 사람만 고친다. 여럿이 고치면 누가 언제로 바꿨는지 알 수 없다.
drop policy if exists meetups_owner_update on public.meetups;
create policy meetups_owner_update on public.meetups
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists meetups_owner_delete on public.meetups;
create policy meetups_owner_delete on public.meetups
  for delete to authenticated using (created_by = auth.uid());

-- ── 참석 여부 ──────────────────────────────────────────────────────────────
create table if not exists public.meetup_rsvps (
  meetup_id  uuid not null references public.meetups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     text not null check (status in ('going', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

alter table public.meetup_rsvps enable row level security;

drop policy if exists rsvps_member_read on public.meetup_rsvps;
create policy rsvps_member_read on public.meetup_rsvps
  for select to authenticated using (public.is_member());

drop policy if exists rsvps_self_write on public.meetup_rsvps;
create policy rsvps_self_write on public.meetup_rsvps
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());

drop policy if exists rsvps_self_update on public.meetup_rsvps;
create policy rsvps_self_update on public.meetup_rsvps
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists rsvps_self_delete on public.meetup_rsvps;
create policy rsvps_self_delete on public.meetup_rsvps
  for delete to authenticated using (user_id = auth.uid());

-- ── 기존 테이블: 쓰기 권한을 '로그인'에서 '회원'으로 좁힌다 ────────────────
-- 가입이 열리므로 authenticated만으로는 부족하다. 초대받은 사람만 목록을 고칠 수 있다.
drop policy if exists games_auth_insert on public.games;
create policy games_auth_insert on public.games
  for insert to authenticated with check (public.is_member());

drop policy if exists games_auth_update on public.games;
create policy games_auth_update on public.games
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists games_auth_delete on public.games;
create policy games_auth_delete on public.games
  for delete to authenticated using (public.is_member());

drop policy if exists members_auth_insert on public.members;
create policy members_auth_insert on public.members
  for insert to authenticated with check (public.is_member());

drop policy if exists members_auth_update on public.members;
create policy members_auth_update on public.members
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists members_auth_delete on public.members;
create policy members_auth_delete on public.members
  for delete to authenticated using (public.is_member());

drop policy if exists plays_auth_insert on public.plays;
create policy plays_auth_insert on public.plays
  for insert to authenticated with check (public.is_member());

drop policy if exists plays_auth_update on public.plays;
create policy plays_auth_update on public.plays
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists plays_auth_delete on public.plays;
create policy plays_auth_delete on public.plays
  for delete to authenticated using (public.is_member());

-- ── 게시글 이미지 저장소 ───────────────────────────────────────────────────
-- 공개 버킷이지만 경로가 uuid라 추측할 수 없다. CDN 캐시를 타서 피드 스크롤이 가볍다.
-- 나중에 NAS로 옮겨도 DB에는 경로만 있으므로 앱의 base URL만 바꾸면 된다.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

drop policy if exists post_images_public_read on storage.objects;
create policy post_images_public_read on storage.objects
  for select using (bucket_id = 'post-images');

drop policy if exists post_images_member_insert on storage.objects;
create policy post_images_member_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'post-images' and public.is_member());

drop policy if exists post_images_member_delete on storage.objects;
create policy post_images_member_delete on storage.objects
  for delete to authenticated using (bucket_id = 'post-images' and owner = auth.uid());

-- ── 부트스트랩 ─────────────────────────────────────────────────────────────
-- 지금 있는 계정(공용 계정)을 첫 회원으로 만든다. 이게 없으면 아무도 초대할 수 없다.
insert into public.profiles (id, handle, display_name)
select u.id, split_part(u.email, '@', 1), split_part(u.email, '@', 1)
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;
