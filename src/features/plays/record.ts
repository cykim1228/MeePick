import type { PlayWithGame } from './queries';
import { computeStandings, computeStreaks } from './stats';
import type { Member } from './types';

/** 한 사람의 전적 요약 — 내 프로필과 다른 회원 프로필이 같은 것을 보여 준다. */
export type MemberRecord = {
  plays: number;
  /** 라운드 우승 수 (협동 승리 포함) */
  wins: number;
  /** 참여한 라운드 수 — 승률의 분모 */
  rounds: number;
  bestStreak: number;
  /** 가장 많이 한 게임과 판 수 */
  favorite: [title: string, count: number] | null;
  best: { score: number; title: string } | null;
};

/**
 * 전적 계산.
 *
 * 화면 두 곳(내 프로필, 회원 프로필)에서 같은 숫자를 보여야 하므로 한 곳에 둔다 —
 * 따로 계산하면 언젠가 한쪽만 규칙이 바뀌어 같은 사람의 승률이 화면마다 달라진다.
 *
 * 승률은 **라운드 기준**이다. 판마다 라운드 수가 달라 판으로 나누면 부풀거나 깎인다.
 */
export function computeMemberRecord(plays: PlayWithGame[], member: Member): MemberRecord {
  const [standing] = computeStandings(plays, [member]);
  const streak = computeStreaks(plays, [member]).get(member.id);

  // 그 사람이 낀 판만 모아 게임별로 센다 — '최애'는 많이 한 것이다.
  const byGame = new Map<string, number>();
  let best: MemberRecord['best'] = null;
  for (const p of plays) {
    if (!p.memberIds.includes(member.id)) continue;
    byGame.set(p.gameTitle, (byGame.get(p.gameTitle) ?? 0) + 1);
    // 점수는 라운드별이 기본이고, 예전에 판 단위로 남긴 점수도 후보로 읽는다.
    const scores = [
      ...Object.entries(p.scores),
      ...p.rounds.flatMap((r) => Object.entries(r.scores)),
    ].filter(([id]) => id === member.id);
    for (const [, v] of scores) if (!best || v > best.score) best = { score: v, title: p.gameTitle };
  }
  const top = [...byGame.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    plays: standing?.playCount ?? 0,
    wins: standing?.roundWins ?? 0,
    rounds: standing?.roundsPlayed ?? 0,
    bestStreak: streak?.best ?? 0,
    favorite: top ? [top[0], top[1]] : null,
    best,
  };
}
