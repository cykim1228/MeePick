import { requireAuth } from '@/lib/auth';
import { localToday } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import { toMember, toPlay, toRoundsJson, type MemberRow, type PlayRow } from './mappers';
import type { Member, Play, PlayRound } from './types';

/**
 * 반환: Member[] (이름순).
 * 숨긴 멤버는 뺀다 — 운영 계정처럼 실제로 게임하지 않는 사람이 오늘의 멤버 후보에
 * 섞이면 인원수가 어긋난다. 지난 기록에 이름을 붙일 때는 이 목록을 쓰지 않으므로
 * 과거 참가자 표시에는 영향이 없다.
 */
export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('hidden', false)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toMember(row as MemberRow));
}

/**
 * 계정이 없는 '손님' 멤버들. 회원 관리에서 "이 계정 = 저 손님"을 이어 줄 때 후보로 쓴다.
 * 숨긴 멤버는 애초에 사람이 아니므로 뺀다.
 */
export async function fetchGuestMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .is('profile_id', null)
    .eq('hidden', false)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toMember(row as MemberRow));
}

/**
 * 손님 기록을 계정에 잇는다(모임장 전용).
 *
 * 손님 행을 살리고 가입 때 생긴 빈 행을 지우는 방향이다 — 지난 판들이 손님 행에
 * 걸려 있어서, 반대로 하면 plays.member_ids와 라운드 jsonb 안의 uuid를 전부 갈아야 한다.
 * 판단이 필요한 경우(그 계정에 이미 기록이 있음)는 서버가 거절한다.
 */
export async function linkGuestToProfile(guestId: string, profileId: string): Promise<Member> {
  await requireAuth();
  const { data, error } = await supabase.rpc('link_guest_to_profile', {
    p_guest_id: guestId,
    p_profile_id: profileId,
  });
  if (error) {
    if (error.code === 'PGRST202')
      throw new Error(
        '연결 함수가 아직 없습니다. supabase/migrations/20260827090000_meetup_sessions.sql 을 실행하세요.'
      );
    throw new Error(error.message);
  }
  return toMember(data as MemberRow);
}

/** 반환: Member (생성된 행). 같은 이름은 23505로 거부된다. */
export async function createMember(name: string): Promise<Member> {
  await requireAuth();
  const { data, error } = await supabase
    .from('members')
    .insert({ name: name.trim() })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`"${name.trim()}"은(는) 이미 있는 멤버입니다.`);
    throw new Error(error.message);
  }
  return toMember(data as MemberRow);
}

/**
 * 멤버 이름 변경. 반환: Member (갱신된 행).
 * id가 유지되므로 과거 플레이·우승 기록이 새 이름으로 그대로 따라온다 — 삭제와 달리
 * 기록이 있어도 안전하다. 오타 수정은 반드시 이쪽으로.
 */
export async function renameMember(id: string, name: string): Promise<Member> {
  await requireAuth();
  const trimmed = name.trim();
  const { data, error } = await supabase
    .from('members')
    .update({ name: trimmed })
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error(`"${trimmed}"은(는) 이미 있는 멤버입니다.`);
    throw new Error(error.message);
  }
  return toMember(data as MemberRow);
}

/**
 * 멤버 삭제. 플레이 기록에 등장한 멤버는 지우지 않는다 —
 * rounds의 winnerIds가 FK가 아니어서, 지우면 과거 우승 기록이 유령 id가 된다.
 */
export async function deleteMember(id: string): Promise<void> {
  await requireAuth();
  const { data: used, error: checkError } = await supabase
    .from('plays')
    .select('id')
    .contains('member_ids', [id])
    .limit(1);
  if (checkError) throw new Error(checkError.message);
  if (used && used.length > 0)
    throw new Error('플레이 기록이 있는 멤버는 삭제할 수 없습니다. 이름이 틀렸다면 이름 변경으로 고치세요.');

  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** 반환: Play | null — 진행 중(ended_at null)인 플레이. 동시에 여러 개면 가장 최근 것. */
export async function fetchActivePlay(): Promise<Play | null> {
  const { data, error } = await supabase
    .from('plays')
    .select('*')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toPlay(data as PlayRow) : null;
}

/**
 * 반환: Map<gameId, 끝난 플레이 수>
 * 게임별 플레이 횟수의 근거. 행이 적어(집용, 수백 건 수준) 전부 받아 클라이언트에서 센다.
 */
export async function fetchPlayCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('plays')
    .select('game_id')
    .not('ended_at', 'is', null)
    .limit(10000);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const id = (row as { game_id: string }).game_id;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

/**
 * 빠른 기록('오늘 이거 했어요'). 반환: Play (곧바로 끝난 상태의 행)
 * plays 행 생성과 last_played_at 갱신을 서버에서 한 번에 — 나누면 횟수와 날짜가 어긋날 수 있다.
 */
export async function logPlay(
  gameId: string,
  memberIds: string[],
  meetupId: string | null = null
): Promise<Play> {
  await requireAuth();
  const { data, error } = await supabase.rpc('log_play', {
    p_game_id: gameId,
    p_member_ids: memberIds,
    p_played_on: localToday(),
    p_meetup_id: meetupId,
  });
  if (error) {
    if (error.code === 'PGRST202')
      throw new Error(
        '빠른 기록 함수가 아직 없습니다. supabase/migrations/20260811210000_log_play.sql 을 SQL Editor에서 실행하세요.'
      );
    throw new Error(error.message);
  }
  const row = data as PlayRow | null;
  if (!row?.id) throw new Error('기록에 실패했습니다.');
  return toPlay(row);
}

/** 기록 화면용 — 게임 제목·표지가 붙은 플레이. */
export type PlayWithGame = Play & {
  gameTitle: string;
  gameImagePath: string | null;
};

/**
 * 반환: PlayWithGame[] — 끝난 플레이 전체, 최근순.
 * 게임 정보는 별도 조회로 붙인다. plays.game_id가 cascade FK라 매칭이 항상 존재한다.
 */
export async function fetchPlayHistory(limit = 500): Promise<PlayWithGame[]> {
  const [{ data: playRows, error: playError }, { data: gameRows, error: gameError }] =
    await Promise.all([
      supabase
        .from('plays')
        .select('*')
        .not('ended_at', 'is', null)
        .order('ended_at', { ascending: false })
        .limit(limit),
      supabase.from('games').select('id,title_ko,image_path').limit(1000),
    ]);
  if (playError) throw new Error(playError.message);
  if (gameError) throw new Error(gameError.message);

  const games = new Map(
    ((gameRows ?? []) as { id: string; title_ko: string; image_path: string | null }[]).map((g) => [
      g.id,
      g,
    ])
  );
  return ((playRows ?? []) as PlayRow[]).map((row) => {
    const play = toPlay(row);
    const game = games.get(play.gameId);
    return {
      ...play,
      gameTitle: game?.title_ko ?? '(삭제된 게임)',
      gameImagePath: game?.image_path ?? null,
    };
  });
}

/** 기록 삭제 — 잘못 남긴 판을 지운다. 끝난 판도 지울 수 있다. */
export async function deletePlay(playId: string): Promise<void> {
  await requireAuth();
  const { error } = await supabase.from('plays').delete().eq('id', playId);
  if (error) throw new Error(error.message);
}

/** 반환: Play[] — 이 게임의 끝난 플레이, 최근순. */
export async function fetchRecentPlays(gameId: string, limit = 3): Promise<Play[]> {
  const { data, error } = await supabase
    .from('plays')
    .select('*')
    .eq('game_id', gameId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toPlay(row as PlayRow));
}

/** 게임 시작. 반환: Play (게임중 상태의 새 플레이) */
export async function startPlay(
  gameId: string,
  memberIds: string[],
  meetupId: string | null = null
): Promise<Play> {
  await requireAuth();
  const { data, error } = await supabase
    .from('plays')
    .insert({ game_id: gameId, member_ids: memberIds, meetup_id: meetupId })
    .select('*')
    .single();
  if (error) {
    // DB의 부분 unique 인덱스가 활성 플레이를 한 판으로 강제한다. 다른 탭/기기에서 이미 시작한 경우.
    if (error.code === '23505')
      throw new Error('이미 진행 중인 게임이 있습니다. 다른 기기에서 시작했을 수 있어요 — 새로고침 후 확인하세요.');
    // 일정 연결 칼럼이 아직 없는 DB. 원인을 못 알아보면 '게임 시작이 안 된다'로만 보인다.
    if (/meetup_id/.test(error.message))
      throw new Error(
        '일정 연결 칼럼이 아직 없습니다. supabase/migrations/20260827090000_meetup_sessions.sql 을 SQL Editor에서 실행하세요.'
      );
    throw new Error(error.message);
  }
  return toPlay(data as PlayRow);
}

/** 진행 중 플레이의 멤버 교체 — 중간 합류/이탈. 반환: Play */
export async function updatePlayMembers(playId: string, memberIds: string[]): Promise<Play> {
  await requireAuth();
  const { data, error } = await supabase
    .from('plays')
    .update({ member_ids: memberIds })
    .eq('id', playId)
    .is('ended_at', null)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return toPlay(data as PlayRow);
}

/** 라운드 기록 갱신. 반환: Play */
export async function updatePlayRounds(playId: string, rounds: PlayRound[]): Promise<Play> {
  await requireAuth();
  const { data, error } = await supabase
    .from('plays')
    .update({ rounds: toRoundsJson(rounds) })
    .eq('id', playId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return toPlay(data as PlayRow);
}

/**
 * 판 내용 일괄 수정 — 지난 기록 편집과 점수 저장이 쓴다. 끝난 판도 수정 가능.
 * 반환: Play
 */
export async function updatePlayRecord(
  playId: string,
  patch: { rounds?: PlayRound[]; memo?: string | null; scores?: Record<string, number> }
): Promise<Play> {
  await requireAuth();
  const body: Partial<PlayRow> = {};
  if (patch.rounds !== undefined) body.rounds = toRoundsJson(patch.rounds);
  if (patch.memo !== undefined) body.memo = patch.memo;
  if (patch.scores !== undefined) body.scores = patch.scores;

  const { data, error } = await supabase
    .from('plays')
    .update(body)
    .eq('id', playId)
    .select('*')
    .single();
  if (error) {
    if (/scores/.test(error.message) && /column|schema/.test(error.message))
      throw new Error(
        '점수 컬럼이 아직 없습니다. supabase/migrations/20260812010000_play_scores.sql 을 SQL Editor에서 실행하세요.'
      );
    throw new Error(error.message);
  }
  return toPlay(data as PlayRow);
}

/**
 * 게임 종료. 반환: Play (닫힌 플레이)
 * RPC인 이유: 플레이 종료와 games.last_played_at 갱신을 서버에서 한 번에 처리한다.
 */
export async function endPlay(playId: string, memo?: string): Promise<Play> {
  await requireAuth();
  const { data, error } = await supabase.rpc('end_play', {
    p_play_id: playId,
    // 서버 current_date는 UTC라 KST 새벽에 하루 어긋난다. 로컬 날짜를 명시한다.
    p_played_on: localToday(),
    ...(memo?.trim() ? { p_memo: memo.trim() } : {}),
  });
  if (error) throw new Error(error.message);

  // 일치 행이 없으면 NULL 컴포지트({ id: null, ... })가 온다. mark_played와 같은 함정.
  const row = data as PlayRow | null;
  if (!row?.id) throw new Error('종료할 플레이를 찾지 못했습니다. 이미 종료되었을 수 있습니다.');
  return toPlay(row);
}

/** 시작 취소 — 진행 중인 플레이를 기록 없이 지운다. 끝난 플레이는 건드리지 않는다. */
export async function cancelPlay(playId: string): Promise<void> {
  await requireAuth();
  const { error } = await supabase.from('plays').delete().eq('id', playId).is('ended_at', null);
  if (error) throw new Error(error.message);
}
