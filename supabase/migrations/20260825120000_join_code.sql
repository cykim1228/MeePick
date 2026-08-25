-- MeePick — 가입 한 번에 끝내기 (고정 참여 코드)
--
-- 앞선 마이그레이션은 "가입 → 나중에 초대 코드 입력"의 2단계였다.
-- 모임이 하나뿐이라 코드도 하나면 충분하고, 가입 화면에서 함께 받는 편이 단순하다.
-- 코드 검증은 계속 서버가 한다 — 앱에 코드를 박아 두면 번들을 열어 보면 그만이다.

-- 이름(실명)과 닉네임을 구분한다. 표시는 닉네임, 누구인지 확인은 이름으로 한다.
alter table public.profiles
  add column if not exists real_name text;

-- 모임 전체가 함께 쓰는 코드라 한 번 쓰고 사라지면 안 된다.
alter table public.invite_codes
  add column if not exists is_reusable boolean not null default false;

/**
 * 실제 코드는 여기 적지 않는다.
 *
 * 이 저장소는 공개돼 있고, 참여 코드는 모임에 들어오는 열쇠다. 코드가 파일에 박혀 있으면
 * 저장소를 본 사람 누구나 알게 되고, 바꿔도 커밋 기록에 그대로 남는다.
 * 자리만 만들어 두고 값은 대시보드에서 채운다.
 *
 *   update public.invite_codes set code = '<실제 코드>' where code = 'CHANGE-ME';
 */
insert into public.invite_codes (code, is_reusable)
values ('CHANGE-ME', true)
on conflict (code) do update set is_reusable = true;

/**
 * 가입 전에 코드만 확인한다. anon이 부를 수 있어야 한다 —
 * 계정을 먼저 만들고 코드가 틀리면, 프로필 없는 유령 계정이 남는다.
 */
create or replace function public.check_invite(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invite_codes
     where code = upper(btrim(p_code))
       and (is_reusable or used_by is null)
  );
$$;

revoke all on function public.check_invite(text) from public;
grant execute on function public.check_invite(text) to anon, authenticated;

-- 인자가 늘어 시그니처가 바뀐다. 옛 함수를 남기면 앱이 어느 쪽을 부르는지 모호해진다.
drop function if exists public.redeem_invite(text, text);

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
  -- 재사용 코드는 소진되지 않는다. 1회용 코드만 사용 여부를 본다.
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
