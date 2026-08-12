import { localToday } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import { toMember, toPlay, toRoundsJson, type MemberRow, type PlayRow } from './mappers';
import type { Member, Play, PlayRound } from './types';

/** 반환: Member[] (이름순) */
export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase.from('members').select('*').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toMember(row as MemberRow));
}

/** 반환: Member (생성된 행). 같은 이름은 23505로 거부된다. */
export async function createMember(name: string): Promise<Member> {
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
 * 멤버 삭제. 플레이 기록에 등장한 멤버는 지우지 않는다 —
 * rounds의 winnerIds가 FK가 아니어서, 지우면 과거 우승 기록이 유령 id가 된다.
 */
export async function deleteMember(id: string): Promise<void> {
  const { data: used, error: checkError } = await supabase
    .from('plays')
    .select('id')
    .contains('member_ids', [id])
    .limit(1);
  if (checkError) throw new Error(checkError.message);
  if (used && used.length > 0)
    throw new Error('플레이 기록이 있는 멤버는 삭제할 수 없습니다. 이름이 틀렸다면 새로 추가하세요.');

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
export async function logPlay(gameId: string, memberIds: string[]): Promise<Play> {
  const { data, error } = await supabase.rpc('log_play', {
    p_game_id: gameId,
    p_member_ids: memberIds,
    p_played_on: localToday(),
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
export async function startPlay(gameId: string, memberIds: string[]): Promise<Play> {
  const { data, error } = await supabase
    .from('plays')
    .insert({ game_id: gameId, member_ids: memberIds })
    .select('*')
    .single();
  if (error) {
    // DB의 부분 unique 인덱스가 활성 플레이를 한 판으로 강제한다. 다른 탭/기기에서 이미 시작한 경우.
    if (error.code === '23505')
      throw new Error('이미 진행 중인 게임이 있습니다. 다른 기기에서 시작했을 수 있어요 — 새로고침 후 확인하세요.');
    throw new Error(error.message);
  }
  return toPlay(data as PlayRow);
}

/** 진행 중 플레이의 멤버 교체 — 중간 합류/이탈. 반환: Play */
export async function updatePlayMembers(playId: string, memberIds: string[]): Promise<Play> {
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
  const { error } = await supabase.from('plays').delete().eq('id', playId).is('ended_at', null);
  if (error) throw new Error(error.message);
}
