/** 앱 도메인 타입. DB는 snake_case, 앱은 camelCase이며 변환은 mappers.ts 한 곳에서만 한다. */
export type Game = {
  id: string;
  titleKo: string;
  titleEn: string | null;
  owned: boolean;

  /** 플레이 가능한 인원 집합. '10인+'는 10으로 저장되고 supports10Plus로 상한 없음을 표현한다. */
  playerCounts: number[];
  /** 재미있는 인원 집합 */
  recommendedCounts: number[];
  /** 가장 좋은 인원 */
  bestCount: number | null;
  supports10Plus: boolean;

  minPlaytime: number | null;
  maxPlaytime: number | null;
  /** 난이도 1.0 ~ 5.0 */
  weight: number | null;

  categories: string[];
  themes: string[];
  mechanics: string[];

  yearPublished: number | null;
  /** 노션 원본 파일명. 업로드 스크립트가 로컬 파일을 찾을 때 쓴다. */
  imageFile: string | null;
  /** Supabase Storage 객체 키. 화면에 표시할 이미지는 이쪽이다. */
  imagePath: string | null;
  /** 룰 설명 영상 (유튜브 링크). 노션 '룰 영상' 속성 또는 앱에서 입력 */
  ruleVideoUrl: string | null;
  description: string | null;
  notes: string | null;

  /** 노션에 값이 없어 채워 넣은 게임. 화면에서 '추정' 배지로 알린다. */
  isEstimated: boolean;
  estimatedFields: string[];

  /** 마지막 플레이 날짜(YYYY-MM-DD). null이면 기록 없음 */
  lastPlayedAt: string | null;
  /** 끝난 플레이 수. plays 테이블 집계로 채워지며 DB 컬럼이 아니다 */
  playCount: number;
};

/** 태블릿 가로에서 목록 옆에 붙는 상세 패널 폭. 레이아웃과 컬럼 계산이 같은 값을 봐야 한다. */
export const DETAIL_PANE_WIDTH = 380;

export type SortKey = 'recommended' | 'mostPlayed' | 'longestUnplayed' | 'shortest' | 'easiest';

export type GameFilter = {
  /** 함께 플레이할 인원. null이면 인원 조건 없음 */
  playerCount: number | null;
  /** 상한 플레이타임(분). null이면 시간 조건 없음 */
  maxPlaytime: number | null;
  /** [최소, 최대] 난이도. null이면 난이도 조건 없음 */
  weightRange: [number, number] | null;
  categories: string[];
  themes: string[];
  mechanics: string[];
  /** 제목 검색어 */
  query: string;
  sort: SortKey;
};

export const EMPTY_FILTER: GameFilter = {
  playerCount: null,
  maxPlaytime: null,
  weightRange: null,
  categories: [],
  themes: [],
  mechanics: [],
  query: '',
  sort: 'recommended',
};
