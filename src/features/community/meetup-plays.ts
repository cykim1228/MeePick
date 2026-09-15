import type { PlayWithGame } from '@/features/plays/queries';
import type { Member } from '@/features/plays/types';
import { localDateOf } from '@/lib/dates';

import type { Meetup, Post } from './types';

/**
 * 그 모임에서 한 판 — 끝난 판만, 한 순서대로.
 *
 * 일정에서 '이 모임 시작'을 눌러 시작한 판에는 일정이 적혀 있다. 하지만 버튼 없이 멤버만 골라
 * 시작한 날도 많다(모임 마무리 리캡도 날짜로 센다). 그래서 일정이 적히지 않은 판은
 * **그날 일정이 이것 하나뿐일 때만** 날짜로 붙인다 — 같은 날 모임이 둘이면 어느 쪽 판인지
 * 앱이 짐작할 수 없다.
 */
export function playsOfMeetup(
  meetup: Meetup,
  meetups: Meetup[],
  plays: PlayWithGame[]
): PlayWithGame[] {
  const day = localDateOf(meetup.startsAt);
  const onlyOne = meetups.filter((m) => localDateOf(m.startsAt) === day).length === 1;
  return plays
    .filter(
      (p) =>
        p.endedAt !== null &&
        (p.meetupId === meetup.id ||
          (p.meetupId === null && onlyOne && localDateOf(p.endedAt) === day))
    )
    .sort((a, b) => (a.endedAt as string).localeCompare(b.endedAt as string));
}

/** 그 모임이 달린 글. */
export function postsOfMeetup(meetup: Meetup, posts: Post[]): Post[] {
  return posts.filter((p) => p.meetupId === meetup.id);
}

/** 판 소요 시간(분). 빠른 기록(0분)과 켜 둔 채 잊은 판은 0으로 친다 — 합계를 망가뜨린다. */
export function playMinutes(play: PlayWithGame): number {
  if (!play.endedAt) return 0;
  const min = Math.round(
    (new Date(play.endedAt).getTime() - new Date(play.startedAt).getTime()) / 60000
  );
  return min >= 1 && min <= 720 ? min : 0;
}

/**
 * 한 판의 결과. 협동 게임은 사람 대신 승패를, 경쟁 게임은 라운드를 이긴 사람과 횟수를 돌려준다.
 * 라운드를 안 남긴 판(빠른 기록)은 null.
 */
export type PlayOutcome =
  | { kind: 'coop'; wins: number; losses: number }
  | { kind: 'winners'; winners: { member: Member; wins: number }[] }
  | null;

export function playOutcome(play: PlayWithGame, members: Member[]): PlayOutcome {
  if (play.rounds.length === 0) return null;
  if (play.rounds.every((r) => r.coop !== null)) {
    const wins = play.rounds.filter((r) => r.coop === 'win').length;
    return { kind: 'coop', wins, losses: play.rounds.length - wins };
  }
  const count = new Map<string, number>();
  for (const r of play.rounds) {
    for (const id of r.winnerIds) count.set(id, (count.get(id) ?? 0) + 1);
  }
  const winners = [...count.entries()]
    .map(([id, wins]) => ({ member: members.find((m) => m.id === id), wins }))
    .filter((w): w is { member: Member; wins: number } => Boolean(w.member))
    .sort((a, b) => b.wins - a.wins);
  return { kind: 'winners', winners };
}
