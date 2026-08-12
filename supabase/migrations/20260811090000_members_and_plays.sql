-- MeePick — 오늘의 멤버와 플레이 기록
-- 흐름: 오늘의 멤버 선택 → 게임 시작(게임중) → 라운드별 우승자/협동 결과 → 메모와 함께 종료.

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 한 판의 플레이. ended_at이 null이면 지금 게임중이라는 뜻이다.
create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  member_ids uuid[] not null default '{}',
  -- 라운드 기록: [{ "winnerIds": [uuid, ...], "coop": "win" | "loss" | null }, ...]
  -- 협동 승리는 전원이 winnerIds에 들어가고, 협동 패배는 winnerIds가 빈다.
  -- 별도 테이블이 아니라 jsonb인 이유: 라운드는 항상 자기 플레이와 함께만 읽히고 단독 조회가 없다.
  rounds jsonb not null default '[]'::jsonb,
  memo text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists plays_game_idx on public.plays (game_id);
create index if not exists plays_active_idx on public.plays (started_at) where ended_at is null;

-- 동시에 진행 중인 플레이는 한 판뿐이다. 클라이언트 가드만으로는 탭 두 개/기기 두 대에서
-- 활성 플레이가 두 개 생기고, 하나를 종료하면 남은 좀비가 '게임중'으로 되살아난다.
create unique index if not exists plays_one_active_idx
  on public.plays ((ended_at is null))
  where ended_at is null;

alter table public.members enable row level security;
alter table public.plays enable row level security;

-- games와 같은 이유로 anon에 전부 연다(집용, 로그인 없음). 보안 경계가 아니다 — CLAUDE.md 참조.
drop policy if exists members_anon_all on public.members;
create policy members_anon_all on public.members
  for all using (true) with check (true);

drop policy if exists plays_anon_all on public.plays;
create policy plays_anon_all on public.plays
  for all using (true) with check (true);

-- 게임 종료. 플레이를 닫으면서 games.last_played_at 갱신까지 한 트랜잭션으로 처리한다 —
-- 두 요청으로 나누면 하나만 성공했을 때 방치도 점수가 실제와 어긋난다.
-- 날짜는 클라이언트가 로컬 기준으로 보낸다. 서버 current_date는 UTC라 KST 새벽에 하루 어긋난다.
create or replace function public.end_play(
  p_play_id uuid,
  p_memo text default null,
  p_played_on date default current_date
)
returns public.plays
language sql
security definer
set search_path = public
as $$
  with ended as (
    update public.plays
       set ended_at = now(),
           memo = coalesce(p_memo, memo)
     where id = p_play_id
       and ended_at is null
    returning *
  ),
  touch as (
    update public.games g
       set last_played_at = p_played_on
      from ended e
     where g.id = e.game_id
  )
  select * from ended;
$$;

revoke all on function public.end_play(uuid, text, date) from public;
grant execute on function public.end_play(uuid, text, date) to anon, authenticated;
