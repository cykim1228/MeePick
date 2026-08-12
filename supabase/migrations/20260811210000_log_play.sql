-- MeePick — 빠른 기록('오늘 이거 했어요')도 plays 행으로 남긴다.
-- 플레이 횟수(N회)의 근거가 plays 테이블이라, 날짜만 갱신하면 횟수에서 빠진다.
-- 세션 없이 뒤늦게 기록하는 경우라 라운드는 비고 멤버는 있으면 담는다.

create or replace function public.log_play(
  p_game_id uuid,
  p_member_ids uuid[] default '{}',
  p_played_on date default current_date
)
returns public.plays
language sql
security definer
set search_path = public
as $$
  with created as (
    insert into public.plays (game_id, member_ids, rounds, started_at, ended_at)
    values (p_game_id, p_member_ids, '[]'::jsonb, now(), now())
    returning *
  ),
  touch as (
    update public.games g
       set last_played_at = p_played_on
      from created c
     where g.id = c.game_id
  )
  select * from created;
$$;

revoke all on function public.log_play(uuid, uuid[], date) from public;
grant execute on function public.log_play(uuid, uuid[], date) to anon, authenticated;
