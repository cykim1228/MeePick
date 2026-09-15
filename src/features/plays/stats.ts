import { localDateOf } from '@/lib/dates';

import type { PlayWithGame } from './queries';
import type { Member, Play } from './types';

/**
 * 명예의 전당 집계.
 *
 * 우승 횟수는 라운드 단위다 — 한 라운드의 winnerIds에 들어 있으면 1승.
 * 공동 우승도 각자 1승이고, 협동 승리는 전원이 winnerIds에 들어 있으므로
 * 자연히 전원 1승으로 집계된다(사용자 규칙). 협동 패배는 winnerIds가 비어 아무도 얻지 않는다.
 */
export type MemberStanding = {
  member: Member;
  /** 라운드 우승 횟수 (협동 승리 포함) */
  roundWins: number;
  /** 그중 협동 승리로 얻은 횟수 */
  coopWins: number;
  /** 참여한 판 수 */
  playCount: number;
  /** 참여한 라운드 수 — 승률의 분모. 참여 판수가 다른 멤버끼리 공정하게 비교하기 위한 값 */
  roundsPlayed: number;
};

export function computeStandings(plays: Play[], members: Member[]): MemberStanding[] {
  const byId = new Map<string, MemberStanding>(
    members.map((m) => [m.id, { member: m, roundWins: 0, coopWins: 0, playCount: 0, roundsPlayed: 0 }])
  );

  for (const play of plays) {
    for (const id of play.memberIds) {
      const s = byId.get(id);
      if (s) s.playCount += 1;
    }
    for (const round of play.rounds) {
      for (const id of play.memberIds) {
        const s = byId.get(id);
        if (s) s.roundsPlayed += 1;
      }
      for (const id of round.winnerIds) {
        const s = byId.get(id);
        if (!s) continue; // 삭제 방지 로직이 있지만, 혹시 남은 유령 id는 조용히 건너뛴다
        s.roundWins += 1;
        if (round.coop === 'win') s.coopWins += 1;
      }
    }
  }

  return [...byId.values()].sort(
    (a, b) =>
      b.roundWins - a.roundWins ||
      b.playCount - a.playCount ||
      a.member.name.localeCompare(b.member.name, 'ko')
  );
}

/**
 * 연승 — 시간순 라운드 기준.
 * 참여한 라운드에서 이기면 +1, 지면 0으로 리셋. 참여하지 않은 판은 연승을 끊지 않는다
 * (하루 쉬었다고 연승이 사라지면 체감상 억울하다). 협동 승리는 전원 연승 지속, 협동 패배는 전원 리셋.
 */
export type Streak = { current: number; best: number };

export function computeStreaks(plays: Play[], members: Member[]): Map<string, Streak> {
  const ordered = [...plays]
    .filter((p) => p.endedAt)
    .sort((a, b) => ((a.endedAt as string) < (b.endedAt as string) ? -1 : 1));

  const map = new Map<string, Streak>(members.map((m) => [m.id, { current: 0, best: 0 }]));
  for (const play of ordered) {
    for (const round of play.rounds) {
      for (const id of play.memberIds) {
        const s = map.get(id);
        if (!s) continue;
        if (round.winnerIds.includes(id)) {
          s.current += 1;
          if (s.current > s.best) s.best = s.current;
        } else {
          s.current = 0;
        }
      }
    }
  }
  return map;
}

/** 멤버별 최고 점수 — 어떤 게임에서 언제 냈는지 함께. 점수를 낸 적 없는 멤버는 빠진다. */
export type BestScore = {
  member: Member;
  score: number;
  gameTitle: string;
  date: string;
};

export function computeBestScores(plays: PlayWithGame[], members: Member[]): BestScore[] {
  const best = new Map<string, BestScore>();
  for (const play of plays) {
    // 점수는 라운드별(rounds[].scores)이 기본이고, 예전에 판 단위로 남긴 scores도 후보로 읽는다.
    const candidates: [string, number][] = [
      ...Object.entries(play.scores),
      ...play.rounds.flatMap((r) => Object.entries(r.scores)),
    ];
    for (const [memberId, score] of candidates) {
      const member = members.find((m) => m.id === memberId);
      if (!member) continue;
      const cur = best.get(memberId);
      if (!cur || score > cur.score) {
        best.set(memberId, {
          member,
          score,
          gameTitle: play.gameTitle,
          date: play.endedAt ? localDateOf(play.endedAt) : '',
        });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** 월별 플레이 수 (최근 월부터). */
export function computeMonthly(plays: Play[]): { month: string; count: number }[] {
  const byMonth = new Map<string, number>();
  for (const play of plays) {
    if (!play.endedAt) continue;
    const month = localDateOf(play.endedAt).slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  return [...byMonth.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));
}

/** 많이 한 게임 순위 — 그 게임의 최다 우승자(라운드 기준)와 함께. */
export type TopGame = {
  title: string;
  count: number;
  /** 사람까지 들고 있는다 — 화면에서 이름을 누르면 그 사람 프로필로 가야 한다. */
  topWinner: { member: Member; wins: number } | null;
};

export function computeTopGames(
  plays: PlayWithGame[],
  members: Member[],
  limit = 5
): TopGame[] {
  const byGame = new Map<string, { title: string; count: number; wins: Map<string, number> }>();
  for (const play of plays) {
    let entry = byGame.get(play.gameId);
    if (!entry) {
      entry = { title: play.gameTitle, count: 0, wins: new Map() };
      byGame.set(play.gameId, entry);
    }
    entry.count += 1;
    for (const round of play.rounds) {
      for (const id of round.winnerIds) {
        entry.wins.set(id, (entry.wins.get(id) ?? 0) + 1);
      }
    }
  }

  return [...byGame.values()]
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'ko'))
    .slice(0, limit)
    .map((entry) => {
      const top = [...entry.wins.entries()].sort((a, b) => b[1] - a[1])[0];
      const member = top ? members.find((m) => m.id === top[0]) : undefined;
      return {
        title: entry.title,
        count: entry.count,
        topWinner: top && member ? { member, wins: top[1] } : null,
      };
    });
}
