/** 플레이 세션 도메인 타입. DB는 snake_case, 앱은 camelCase — 변환은 mappers.ts 한 곳에서만. */

export type Member = {
  id: string;
  name: string;
  /**
   * 앱 회원과 연결된 멤버면 그 회원 id. 가입하면 자동으로 멤버가 생기고 연결된다.
   * null이면 손님 — 로그인 없이 한 판 낀 사람이라 이름만 있다.
   */
  profileId: string | null;
};

/**
 * 한 라운드의 결과.
 * - 일반 라운드: winnerIds 1명 이상, coop는 null
 * - 협동 승리: 전원이 winnerIds에 들어가고 coop는 'win'
 * - 협동 패배: winnerIds가 비고 coop는 'loss'
 */
export type PlayRound = {
  winnerIds: string[];
  coop: 'win' | 'loss' | null;
  /** 라운드 한 줄 메모 (선택) */
  memo: string | null;
  /** 라운드별 개인 점수: memberId → 점수 (선택) */
  scores: Record<string, number>;
};

/** 한 판의 플레이. endedAt이 null이면 지금 게임중이다. */
export type Play = {
  id: string;
  gameId: string;
  memberIds: string[];
  rounds: PlayRound[];
  memo: string | null;
  /**
   * 판 단위 개인 점수 (레거시). 점수는 이제 라운드별(rounds[].scores)로 기록하며,
   * 이 필드는 과거에 판 단위로 남긴 점수를 통계에서 계속 읽기 위해서만 유지한다.
   */
  scores: Record<string, number>;
  startedAt: string;
  endedAt: string | null;
  /** 이 판이 속한 모임 일정. 일정 없이 그냥 모인 날은 null */
  meetupId: string | null;
};
