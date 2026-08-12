-- MeePick — 집 보드게임 소장 목록
-- 출처: 노션 "보드게임 리스트" CSV (156종)
-- 인원은 min/max가 아니라 집합으로 보존한다. 노션이 가능/추천/베스트 3단계로 관리하고 있어
-- min/max로 압축하면 "4인 가능하지만 5인이 베스트" 같은 정보가 사라진다.

create table if not exists public.games (
  id                 uuid primary key default gen_random_uuid(),

  -- 식별
  title_ko           text not null,
  title_en           text,

  -- 소장 여부. 노션 '상태' = 소장/미소장
  owned              boolean not null default true,

  -- 인원 (집합). '10인+'는 10으로 저장하고 supports_10_plus로 상한 없음을 표현한다.
  -- 그냥 10으로만 두면 12명일 때 후보에서 사라진다.
  player_counts      integer[] not null default '{}',
  recommended_counts integer[] not null default '{}',
  best_count         integer,
  supports_10_plus   boolean not null default false,

  -- 플레이타임(분). 노션은 '30–45' 같은 범위 문자열이 섞여 있어 분리해 저장한다.
  min_playtime       integer,
  max_playtime       integer,

  -- 난이도 1.00 ~ 5.00 (노션 실측 범위 1.0 ~ 4.26)
  weight             numeric(3,2),

  -- 분류
  categories         text[] not null default '{}',
  themes             text[] not null default '{}',
  mechanics          text[] not null default '{}',

  -- 부가 정보
  year_published     integer,
  image_file         text,
  description        text,
  notes              text,

  -- 노션에 값이 없어 채워 넣은 항목 표시. 어떤 필드가 추정인지 함께 남겨
  -- 사용자가 나중에 직접 정정할 수 있게 한다.
  is_estimated       boolean not null default false,
  estimated_fields   text[] not null default '{}',

  -- 노션에 없는 필드. "안 하던 게임 발굴"이 이 앱 추천의 핵심 가치이므로 앱이 기록한다.
  last_played_at     date,

  created_at         timestamptz not null default now(),

  constraint games_playtime_order check (
    min_playtime is null or max_playtime is null or max_playtime >= min_playtime
  ),
  constraint games_weight_range check (
    weight is null or (weight >= 1.0 and weight <= 5.0)
  )
);

-- 인원수가 1차 필터이므로 배열 포함 검색이 빨라야 한다.
create index if not exists games_player_counts_idx on public.games using gin (player_counts);
create index if not exists games_categories_idx    on public.games using gin (categories);
create index if not exists games_themes_idx        on public.games using gin (themes);
create index if not exists games_owned_idx         on public.games (owned);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- anon 키는 앱 번들에 포함되므로 읽기만 허용한다. 쓰기는 아래 RPC로만 열어
-- "플레이 기록" 외의 임의 수정이 불가능하게 한다.

alter table public.games enable row level security;

drop policy if exists games_public_read on public.games;
create policy games_public_read on public.games
  for select using (true);

-- ── 플레이 기록 ────────────────────────────────────────────────────────────
-- 방치도 점수가 추천의 핵심이라 last_played_at 갱신 경로가 반드시 있어야 한다.
-- 테이블 UPDATE 정책을 열지 않고 이 함수만 노출한다.

create or replace function public.mark_played(p_game_id uuid, p_played_on date default current_date)
returns public.games
language sql
security definer
set search_path = public
as $$
  update public.games
     set last_played_at = p_played_on
   where id = p_game_id
  returning *;
$$;

revoke all on function public.mark_played(uuid, date) from public;
grant execute on function public.mark_played(uuid, date) to anon, authenticated;
