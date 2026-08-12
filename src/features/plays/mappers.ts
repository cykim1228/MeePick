import type { Database, Json } from '@/lib/database.types';

import type { Member, Play, PlayRound } from './types';

export type MemberRow = Database['public']['Tables']['members']['Row'];
export type PlayRow = Database['public']['Tables']['plays']['Row'];

export function toMember(row: MemberRow): Member {
  return { id: row.id, name: row.name };
}

/**
 * rounds jsonb는 스키마가 강제되지 않으므로 방어적으로 파싱한다.
 * 모양이 어긋난 항목은 조용히 버리는 대신 빈 라운드로 만들지 않고 제외한다 —
 * 깨진 데이터로 우승 기록을 지어내는 것보다 빠지는 쪽이 낫다.
 */
function parseRounds(v: Json): PlayRound[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r): PlayRound[] => {
    if (typeof r !== 'object' || r === null || Array.isArray(r)) return [];
    const o = r as { [key: string]: Json | undefined };
    const winnerIds = Array.isArray(o.winnerIds)
      ? o.winnerIds.filter((x): x is string => typeof x === 'string')
      : [];
    const coop = o.coop === 'win' || o.coop === 'loss' ? o.coop : null;
    const memo = typeof o.memo === 'string' && o.memo.trim() ? o.memo : null;
    const scores = parseScores(o.scores);
    if (!winnerIds.length && coop === null) return []; // 정보가 전혀 없는 항목
    return [{ winnerIds, coop, memo, scores }];
  });
}

export function toRoundsJson(rounds: PlayRound[]): Json {
  return rounds.map((r) => ({
    winnerIds: r.winnerIds,
    coop: r.coop,
    memo: r.memo,
    scores: r.scores,
  }));
}

/** scores jsonb 파싱 — 숫자가 아닌 값은 버린다. 마이그레이션 전(컬럼 없음)에는 undefined가 와서 빈 객체가 된다. */
function parseScores(v: Json | undefined): Record<string, number> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(v)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[key] = val;
  }
  return out;
}

export function toPlay(row: PlayRow): Play {
  return {
    id: row.id,
    gameId: row.game_id,
    memberIds: row.member_ids ?? [],
    rounds: parseRounds(row.rounds),
    memo: row.memo,
    scores: parseScores((row as { scores?: Json }).scores),
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}
