/**
 * 게임 도구 레지스트리 — 특정 게임 전용 기능(점수표·구성표 등)을 게임과 연결한다.
 *
 * 연결은 제목 매칭이다. 노션에서 제목을 바꾸면 도구가 안 뜨게 되므로,
 * 매칭은 공백 무시·부분 포함으로 느슨하게 한다 (에디션 접미사에도 견디도록).
 *
 * 새 도구 추가: 모듈 파일을 만들고 여기 목록에 한 줄 등록하면
 * 게임중 시트가 자동으로 버튼을 띄운다.
 */

export type GameToolKey =
  | 'skull-king'
  | 'avalon'
  | 'las-vegas'
  | 'saboteur'
  | 'flip7'
  | 'citadels'
  | 'bang'
  | 'secret-hitler'
  | 'sechs-nimmt'
  | 'one-night'
  | 'haenyeo'
  | 'deep-sea'
  | 'cascadia'
  | 'deception';

export type GameToolMeta = {
  key: GameToolKey;
  /** 게임중 시트에 뜨는 버튼 라벨 */
  buttonLabel: string;
  /**
   * 표시 방식 (사용자 확정 규칙):
   * - reference: 보기만 하는 참조 도구(구성표·족보) → 선 뽑기·타이머처럼 가운데 팝업
   * - recorder: 실제 기록을 남기는 도구(점수표) → 전체 화면
   */
  kind: 'reference' | 'recorder';
  matches: (titleKo: string) => boolean;
};

const normalize = (t: string) => t.replace(/\s/g, '').toLowerCase();

export const GAME_TOOLS: GameToolMeta[] = [
  {
    key: 'skull-king',
    buttonLabel: '🏴‍☠️ 점수표',
    kind: 'recorder',
    matches: (t) => normalize(t).includes('스컬킹'),
  },
  {
    key: 'avalon',
    buttonLabel: '⚔️ 구성표',
    kind: 'reference',
    matches: (t) => normalize(t).includes('아발론'),
  },
  {
    key: 'las-vegas',
    buttonLabel: '🎰 점수표',
    kind: 'recorder',
    matches: (t) => normalize(t).includes('라스베가스') || normalize(t).includes('라스베이거스'),
  },
  {
    key: 'saboteur',
    buttonLabel: '⛏️ 구성표',
    kind: 'reference',
    matches: (t) => normalize(t).includes('사보타지') || normalize(t).includes('사보타주'),
  },
  {
    key: 'flip7',
    buttonLabel: '🎴 점수표',
    kind: 'recorder',
    matches: (t) => normalize(t).includes('플립7'),
  },
  {
    key: 'citadels',
    buttonLabel: '🏰 정산표',
    kind: 'recorder',
    matches: (t) => normalize(t).includes('시타델'),
  },
  {
    key: 'bang',
    buttonLabel: '⭐ 구성표',
    kind: 'reference',
    matches: (t) => normalize(t).includes('뱅!') || normalize(t) === '뱅',
  },
  {
    key: 'secret-hitler',
    buttonLabel: '🕊️ 구성표',
    kind: 'reference',
    matches: (t) => normalize(t).includes('시크릿히틀러'),
  },
  {
    key: 'sechs-nimmt',
    buttonLabel: '🐮 벌점표',
    kind: 'recorder',
    matches: (t) => normalize(t).includes('젝스님트'),
  },
  {
    // '늑대인간'만으로 매칭하면 "미스터리 파티 : 늑대인간 마을의 축제"까지 걸린다
    key: 'one-night',
    buttonLabel: '🌙 구성표',
    kind: 'reference',
    matches: (t) => normalize(t).includes('한밤의늑대인간'),
  },
  {
    key: 'haenyeo',
    buttonLabel: '🌊 정산표',
    kind: 'recorder',
    matches: (t) => normalize(t).includes('해녀'),
  },
  {
    key: 'deep-sea',
    buttonLabel: '🤿 점수표',
    kind: 'recorder',
    matches: (t) => normalize(t).includes('해저탐험'),
  },
  {
    key: 'cascadia',
    buttonLabel: '🌲 정산표',
    kind: 'recorder',
    matches: (t) => normalize(t).includes('캐스캐디아'),
  },
  {
    key: 'deception',
    buttonLabel: '🔍 구성표',
    kind: 'reference',
    matches: (t) => normalize(t).includes('디셉션'),
  },
];

export function findGameTool(titleKo: string | null | undefined): GameToolMeta | null {
  if (!titleKo) return null;
  return GAME_TOOLS.find((tool) => tool.matches(titleKo)) ?? null;
}
