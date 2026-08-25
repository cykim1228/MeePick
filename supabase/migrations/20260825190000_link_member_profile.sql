-- MeePick — 회원(profiles)과 플레이 멤버(members) 잇기
--
-- 둘은 원래 다른 개념이다. members는 "오늘 게임을 같이 한 사람"이라 로그인과 무관하게
-- 존재하고(손님도 한 판 낄 수 있다), profiles는 앱 계정이다.
-- 그런데 가입한 사람을 멤버 목록에 손으로 또 적는 건 명백한 중복이라, 가입 시 자동으로
-- 멤버 행을 만들고 연결한다. 기록(plays.member_ids)은 계속 members.id를 가리키므로
-- 기존 데이터와 통계는 손대지 않는다.

alter table public.members
  add column if not exists profile_id uuid unique references public.profiles (id) on delete set null;

/**
 * 회원의 멤버 행을 보장한다.
 * 같은 이름의 멤버가 이미 있으면 그 행에 연결한다 — 가입 전에 손으로 적어 둔 사람이
 * 대부분 본인이고, 새로 만들면 같은 사람이 목록에 둘로 보인다.
 */
create or replace function public.ensure_member_for_profile(p_profile_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.members where profile_id = p_profile_id;
  if v_id is not null then
    return v_id;
  end if;

  select id into v_id from public.members where name = p_name and profile_id is null;
  if v_id is not null then
    update public.members set profile_id = p_profile_id where id = v_id;
    return v_id;
  end if;

  -- 이름이 겹치는데 이미 다른 회원의 것이면 뒤에 아이디를 붙여 구분한다.
  insert into public.members (name, profile_id)
  values (
    case when exists (select 1 from public.members where name = p_name)
      then p_name || ' (' || (select handle from public.profiles where id = p_profile_id) || ')'
      else p_name end,
    p_profile_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- 가입 절차에 멤버 생성을 끼워 넣는다. 프로필이 생기는 유일한 경로가 여기다.
create or replace function public.redeem_invite(
  p_code text,
  p_display_name text,
  p_real_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_handle  text;
  v_code    public.invite_codes;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception '이미 가입된 회원입니다.';
  end if;

  select * into v_code from public.invite_codes
   where code = upper(btrim(p_code)) for update;

  if v_code.code is null then
    raise exception '참여 코드가 올바르지 않습니다.';
  end if;
  if not v_code.is_reusable and v_code.used_by is not null then
    raise exception '이미 사용된 코드입니다.';
  end if;

  select split_part(email, '@', 1) into v_handle from auth.users where id = v_uid;

  insert into public.profiles (id, handle, display_name, real_name)
  values (
    v_uid,
    v_handle,
    coalesce(nullif(btrim(p_display_name), ''), v_handle),
    nullif(btrim(p_real_name), '')
  )
  returning * into v_profile;

  perform public.ensure_member_for_profile(v_profile.id, v_profile.display_name);

  if not v_code.is_reusable then
    update public.invite_codes
       set used_by = v_uid, used_at = now()
     where code = v_code.code;
  end if;

  return v_profile;
end;
$$;

revoke all on function public.redeem_invite(text, text, text) from public;
grant execute on function public.redeem_invite(text, text, text) to authenticated;
revoke all on function public.ensure_member_for_profile(uuid, text) from public;
grant execute on function public.ensure_member_for_profile(uuid, text) to authenticated;

-- 닉네임을 바꾸면 멤버 이름도 따라가야 한다. 두 곳이 갈라지면 기록에서 누군지 헷갈린다.
create or replace function public.sync_member_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.members set name = new.display_name
   where profile_id = new.id and name <> new.display_name
     and not exists (select 1 from public.members m2 where m2.name = new.display_name);
  return new;
end;
$$;

drop trigger if exists profiles_sync_member_name on public.profiles;
create trigger profiles_sync_member_name
  after update of display_name on public.profiles
  for each row execute function public.sync_member_name();

-- 이미 가입한 회원들 백필 — 이게 없으면 기존 회원만 멤버 목록에서 빠진다.
do $$
declare r record;
begin
  for r in select id, display_name from public.profiles loop
    perform public.ensure_member_for_profile(r.id, r.display_name);
  end loop;
end $$;
