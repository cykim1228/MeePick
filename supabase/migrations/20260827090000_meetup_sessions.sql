-- MeePick — 일정과 플레이를 잇는다
--
-- 지금까지 일정은 "언제 모일지"만 말하고, 기록은 "무엇을 했는지"만 말했다. 둘이 만나지
-- 않아서, 일정을 잡아 놓고도 막상 모이면 오늘의 멤버를 처음부터 다시 골라야 했고
-- 지난 모임을 돌아볼 때 "그날 뭐 했더라"는 기록 화면을 날짜로 뒤져야 했다.
--
-- plays에 일정을 달아 그 고리를 잇는다. null이면 일정 없이 그냥 모인 날이다 —
-- 대부분의 판이 그럴 것이므로 null이 정상이지 결손이 아니다.

alter table public.plays
  add column if not exists meetup_id uuid references public.meetups (id) on delete set null;

-- "이 모임에서 몇 판" 집계가 주 질의다.
create index if not exists plays_meetup_idx on public.plays (meetup_id) where meetup_id is not null;

/**
 * 빠른 기록도 일정을 달 수 있어야 한다.
 *
 * 인자를 뒤에 default로 붙여, 이 마이그레이션 전에 만들어진 호출(인자 3개)도 그대로 돈다.
 * 예전 시그니처를 남겨 두면 PostgREST가 어느 쪽을 부를지 모호해지므로 함께 지운다.
 */
drop function if exists public.log_play(uuid, uuid[], date);

create or replace function public.log_play(
  p_game_id uuid,
  p_member_ids uuid[] default '{}',
  p_played_on date default current_date,
  p_meetup_id uuid default null
)
returns public.plays
language sql
security definer
set search_path = public
as $$
  with created as (
    insert into public.plays (game_id, member_ids, rounds, started_at, ended_at, meetup_id)
    values (p_game_id, p_member_ids, '[]'::jsonb, now(), now(), p_meetup_id)
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

revoke all on function public.log_play(uuid, uuid[], date, uuid) from public;
grant execute on function public.log_play(uuid, uuid[], date, uuid) to anon, authenticated;


-- ── 손님을 회원으로 잇기 ────────────────────────────────────────────────────
--
-- 김나영처럼 계정 없이 이름만으로 기록에 쌓인 '손님'이 나중에 가입하면, 가입 시 자동으로
-- 새 members 행이 생겨 **같은 사람이 둘로 갈라진다.** 전적도 둘로 쪼개진다.
--
-- 이어 붙이는 방향은 하나뿐이다: **손님 행을 살리고 새 행을 지운다.** 손님 행에 지난
-- 판들이 걸려 있어서다. 반대로 하면 plays.member_ids에 박힌 uuid를 전부 갈아야 하는데,
-- jsonb 라운드 안의 winnerIds까지 따라가야 해서 조용히 틀릴 여지가 크다.

create or replace function public.link_guest_to_profile(p_guest_id uuid, p_profile_id uuid)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest   public.members;
  v_account public.members;
begin
  if not public.is_admin() then
    raise exception '모임장만 할 수 있어요.';
  end if;

  select * into v_guest from public.members where id = p_guest_id;
  if v_guest is null then
    raise exception '손님을 찾을 수 없어요.';
  end if;
  if v_guest.profile_id is not null then
    raise exception '이미 계정과 연결된 사람이에요.';
  end if;

  -- 가입할 때 자동으로 생긴 빈 행. 없을 수도 있다(직접 만든 계정 등).
  select * into v_account from public.members where profile_id = p_profile_id;

  if v_account is not null then
    if v_account.id = p_guest_id then
      return v_guest;
    end if;
    -- 판이 걸려 있는 행을 지우면 기록이 사라진다. 그런 경우는 사람이 판단해야 한다.
    if exists (select 1 from public.plays where v_account.id = any (member_ids)) then
      raise exception '그 계정에 이미 플레이 기록이 있어요. 자동으로 합칠 수 없습니다.';
    end if;
    delete from public.members where id = v_account.id;
  end if;

  update public.members
     set profile_id = p_profile_id,
         -- 이름은 계정의 닉네임을 따른다. 손님 때 적어 둔 별명보다 본인이 정한 이름이 낫다.
         name = coalesce((select display_name from public.profiles where id = p_profile_id), name)
   where id = p_guest_id
  returning * into v_guest;

  return v_guest;
end;
$$;

revoke all on function public.link_guest_to_profile(uuid, uuid) from public;
grant execute on function public.link_guest_to_profile(uuid, uuid) to authenticated;
