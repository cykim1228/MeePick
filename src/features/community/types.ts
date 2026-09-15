/** 모임 커뮤니티 도메인 타입. DB는 snake_case, 앱은 camelCase — 변환은 mappers.ts에서만. */

export type Profile = {
  id: string;
  /** 로그인 아이디와 같은 값 */
  handle: string;
  /** 닉네임 — 피드·댓글에 보이는 이름 */
  displayName: string;
  /** 실명 — 누가 누군지 확인용. 화면에는 잘 쓰지 않는다 */
  realName: string | null;
  avatarPath: string | null;
  /** 한 줄 소개 */
  bio: string | null;
  /** 모임장 — 남의 글 삭제와 회원 내보내기가 가능하다 */
  isAdmin: boolean;
  /**
   * 첫 안내(좋아하는 게임 고르기)를 아직 안 본 사람인가.
   *
   * 시각이 아니라 판정 결과를 들고 다닌다 — 칼럼이 없는 DB(마이그레이션 전)와
   * "아직 안 봤다"를 화면이 구별할 수 없기 때문이다. 구별은 매퍼가 한 번만 한다.
   */
  needsOnboarding: boolean;
};

export type Post = {
  id: string;
  author: Profile;
  body: string;
  imagePaths: string[];
  /** 이 글이 가리키는 게임 (선택) */
  gameId: string | null;
  gameTitle: string | null;
  gameImagePath: string | null;
  /** 이 글이 속한 모임 일정 (선택) */
  meetupId: string | null;
  meetupTitle: string | null;
  createdAt: string;
  /** 수정된 글이면 createdAt과 다르다 */
  updatedAt: string;
  likeCount: number;
  likedByMe: boolean;
  /** 좋아요를 누른 사람들 — 'OO님 외 2명' 문구를 만들 때 쓴다 */
  likers: Profile[];
  commentCount: number;
};

export type Comment = {
  id: string;
  postId: string;
  author: Profile;
  body: string;
  createdAt: string;
};

export type RsvpStatus = 'going' | 'maybe' | 'no';

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  going: '갈게요',
  maybe: '아마도',
  no: '못 가요',
};

export type Meetup = {
  id: string;
  title: string;
  startsAt: string;
  place: string | null;
  memo: string | null;
  /** 정원. null이면 제한 없음. 넘겨도 막지 않고 표시만 한다 */
  capacity: number | null;
  createdBy: string;
  /**
   * 이미 지난 모임인지. 조회 시점에 판정한다 —
   * 화면에서 Date.now()를 부르면 리렌더마다 결과가 달라질 수 있고,
   * 목록의 항목마다 기준 시각이 미세하게 어긋난다.
   */
  isPast: boolean;
  /** 참석 응답 — 상태별 프로필 목록 */
  rsvps: { profile: Profile; status: RsvpStatus }[];
  /** 내 응답. 아직 안 했으면 null */
  myStatus: RsvpStatus | null;
};

/**
 * 알림 한 줄 — '내게 온 일'.
 *   comment  내 글에 달린 댓글
 *   like     내 글에 눌린 좋아요 (글마다 한 줄로 묶는다)
 *   meetup   다른 사람이 만든 새 일정
 *   rsvp     내가 만든 일정에 온 참석 응답
 *   soon     간다고 한 모임이 24시간 안으로 다가옴
 */
export type NotificationKind = 'comment' | 'like' | 'meetup' | 'rsvp' | 'soon';

export type AppNotification = {
  /** 목록 키. 같은 일이면 다시 받아도 같은 값이다 */
  id: string;
  kind: NotificationKind;
  /** 일이 생긴 시각(ISO, Z 형식으로 맞춘다) — 정렬과 '새 알림' 판정에 쓴다 */
  at: string;
  /** 한 사람 이상. 좋아요는 여럿이 묶이고 가장 최근 사람이 앞이다. soon은 비어 있다 */
  actors: Profile[];
  postId: string | null;
  /** 글 미리보기 — 첫 사진 경로 */
  postImage: string | null;
  /** 글 미리보기 — 본문 앞부분 */
  postText: string | null;
  commentText: string | null;
  meetup: { id: string; title: string; startsAt: string; place: string | null } | null;
  rsvpStatus: RsvpStatus | null;
};

export type InviteCode = {
  code: string;
  /** 모임 전체가 함께 쓰는 코드. 한 번 쓰고 사라지지 않는다 */
  isReusable: boolean;
  usedBy: string | null;
  usedAt: string | null;
  createdAt: string;
};
