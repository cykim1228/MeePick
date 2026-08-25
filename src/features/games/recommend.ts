import type { Game, GameFilter, PlaytimeBand, SortKey } from './types';

/* ── 파생 개념 ─────────────────────────────────────────────────────────────
 * 화면에서 쓰는 말은 원시 필드가 아니라 파생값이다. 계산은 여기 한 곳에서만 한다. */

export function weightLabel(weight: number | null): string {
  if (weight === null) return '난이도 미상';
  if (weight < 2) return '가볍게';
  if (weight < 3) return '적당히';
  if (weight < 4) return '묵직하게';
  return '본격적으로';
}

export function playtimeLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) return '시간 미상';
  if (min !== null && max !== null && min !== max) return `${min}~${max}분`;
  return `${max ?? min}분`;
}

/**
 * 게임이 속한 시간 구간. **최대 소요 시간 기준**이다 —
 * '30~45분'은 45분짜리로 보고 1시간 구간에 넣는다. 최소값으로 잡으면
 * 길어질 수 있는 게임이 짧은 구간에 섞여 "30분 안에 끝내자"는 약속이 깨진다.
 * 시간 정보가 없으면 null이고, 시간 필터를 걸면 후보에서 빠진다.
 */
export function playtimeBandOf(game: Game): PlaytimeBand | null {
  const t = game.maxPlaytime ?? game.minPlaytime;
  if (t === null) return null;
  if (t <= 30) return 'short';
  if (t <= 60) return 'medium';
  if (t <= 120) return 'long';
  return 'epic';
}

export function playerLabel(game: Game): string {
  if (!game.playerCounts.length) return '인원 미상';
  const lo = game.playerCounts[0];
  const hi = game.playerCounts[game.playerCounts.length - 1];
  const range = lo === hi ? `${lo}인` : `${lo}~${hi}인`;
  return game.supports10Plus ? `${range}+` : range;
}

export type Neglect = 'never' | 'long' | 'while' | 'recent';

export function neglectOf(game: Game, today = new Date()): Neglect {
  if (!game.lastPlayedAt) return 'never';
  const days = Math.floor((today.getTime() - new Date(game.lastPlayedAt).getTime()) / 86_400_000);
  if (days > 180) return 'long';
  if (days > 30) return 'while';
  return 'recent';
}

export const NEGLECT_LABEL: Record<Neglect, string> = {
  never: '아직 안 해봄',
  long: '오랜만',
  while: '한동안 안 함',
  recent: '최근에 함',
};

/* ── 인원 적합도 ───────────────────────────────────────────────────────────
 * 노션이 가능/추천/베스트 3단계로 관리하므로 그 구분을 그대로 살린다.
 * '가능'과 '베스트'는 체감이 완전히 다르다. */

export type PlayerFit = 'best' | 'recommended' | 'possible' | 'no';

export function playerFit(game: Game, n: number): PlayerFit {
  const supported = game.playerCounts.includes(n) || (game.supports10Plus && n >= 10);
  if (!supported) return 'no';
  if (game.bestCount === n) return 'best';
  if (game.recommendedCounts.includes(n)) return 'recommended';
  return 'possible';
}

/* ── 하드 필터 ─────────────────────────────────────────────────────────────
 * 통과하지 못한 게임은 점수와 무관하게 제외된다. */

export function passesFilter(game: Game, f: GameFilter): boolean {
  if (f.playerCount !== null && playerFit(game, f.playerCount) === 'no') return false;

  // 구간은 서로 겹치지 않는다 — 1시간을 고르면 30분짜리는 나오지 않는다.
  if (f.playtimeBand !== null && playtimeBandOf(game) !== f.playtimeBand) return false;

  if (f.weightRange !== null) {
    if (game.weight === null) return false;
    const [lo, hi] = f.weightRange;
    if (game.weight < lo || game.weight > hi) return false;
  }

  // 같은 축 안에서는 OR, 축 사이는 AND
  if (f.categories.length && !f.categories.some((c) => game.categories.includes(c))) return false;
  if (f.themes.length && !f.themes.some((t) => game.themes.includes(t))) return false;
  if (f.mechanics.length && !f.mechanics.some((m) => game.mechanics.includes(m))) return false;

  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const hit =
      game.titleKo.toLowerCase().includes(q) || (game.titleEn?.toLowerCase().includes(q) ?? false);
    if (!hit) return false;
  }

  return true;
}

/* ── 점수 ──────────────────────────────────────────────────────────────────
 * 가중치는 스펙의 일부다. 화면에서 임의로 바꾸지 않는다. */

/**
 * 하트 정보. 게임 객체에 얹지 않고 따로 넘긴다 — 게임 캐시와 하트는 갱신 주기가 다르고
 * (하트는 로그인마다 다시 읽는다), 한 객체로 합치면 하트 한 번에 목록 전체가 새 객체가 된다.
 */
export type LikeContext = {
  /** gameId → 하트를 누른 사람들 */
  byGame: Map<string, Set<string>>;
  /** 오늘 온 사람들의 profile id. 비어 있으면 하트는 점수에 영향을 주지 않는다 */
  audience: Set<string>;
};

export const NO_LIKES: LikeContext = { byGame: new Map(), audience: new Set() };

/**
 * 오늘 온 사람들 중 이 게임에 하트를 누른 비율(0~1).
 * 사람 수가 아니라 비율인 이유: 2명 모인 날의 2표와 8명 모인 날의 2표는 무게가 다르다.
 */
function audienceLikeRatio(game: Game, likes: LikeContext): number {
  if (likes.audience.size === 0) return 0;
  const who = likes.byGame.get(game.id);
  if (!who) return 0;
  let hits = 0;
  for (const id of likes.audience) if (who.has(id)) hits += 1;
  return hits / likes.audience.size;
}

export function scoreGame(
  game: Game,
  f: GameFilter,
  today = new Date(),
  likes: LikeContext = NO_LIKES
): number {
  let score = 0;

  if (f.playerCount !== null) {
    const fit = playerFit(game, f.playerCount);
    if (fit === 'best') score += 40;
    else if (fit === 'recommended') score += 30;
    else if (fit === 'possible') score += 15;

    // 최대 인원에 딱 맞으면 대기 시간이 길어지는 경향
    const hi = game.playerCounts[game.playerCounts.length - 1];
    if (f.playerCount === hi && fit === 'possible') score -= 5;
  }

  // 시간은 점수를 주지 않는다 — 구간이 하드 필터라 통과한 게임은 전부 같은 구간이고,
  // 모두에게 같은 값을 더하면 순위가 바뀌지 않는다.

  if (f.weightRange !== null && game.weight !== null) {
    const [lo, hi] = f.weightRange;
    if (game.weight >= lo && game.weight <= hi) score += 15;
  }

  // 소장 목록이 고정된 집에서는 "안 하던 것 발굴"이 추천의 실질적 가치다.
  // 다만 인원 적합도(40점)를 넘지 않게 둔다 — 인원이 안 맞으면 아무리 새로워도 못 한다.
  const neglect = neglectOf(game, today);
  if (neglect === 'never') score += 25;
  else if (neglect === 'long') score += 15;
  else if (neglect === 'while') score += 5;
  else score -= 10;

  /**
   * 오늘 온 사람들이 하고 싶어 하는 게임.
   *
   * 최대 20점 — 방치도(25점)보다는 낮고 난이도 적합(15점)보다는 높게 뒀다.
   * "오랫동안 안 한 것"은 앱이 짐작하는 가치이고 하트는 사람이 직접 말한 것이라
   * 더 무겁게 볼 이유가 있지만, 그 말이 몇 달 전 것일 수도 있어 발굴을 뒤엎진 않게 한다.
   * 전원이 하트를 눌렀을 때만 20점이 다 붙는다.
   */
  score += 20 * audienceLikeRatio(game, likes);

  // 추정값으로 채운 게임은 확신이 낮으므로 동점일 때 뒤로 보낸다.
  if (game.isEstimated) score -= 3;

  return score;
}

/* ── 정렬 ──────────────────────────────────────────────────────────────── */

const byTitle = (a: Game, b: Game) => a.titleKo.localeCompare(b.titleKo, 'ko');

function comparator(sort: SortKey, f: GameFilter, today: Date, likes: LikeContext) {
  switch (sort) {
    case 'mostLiked':
      return (a: Game, b: Game) => {
        const av = likes.byGame.get(a.id)?.size ?? 0;
        const bv = likes.byGame.get(b.id)?.size ?? 0;
        // 하트가 같으면 추천 점수로 갈라 준다 — 아무도 안 누른 구간이 제목순으로 죽 늘어서면
        // '하트순'이라는 이름이 무색해진다.
        if (av !== bv) return bv - av;
        const diff = scoreGame(b, f, today, likes) - scoreGame(a, f, today, likes);
        return diff !== 0 ? diff : byTitle(a, b);
      };
    case 'mostPlayed':
      return (a: Game, b: Game) => {
        if (b.playCount !== a.playCount) return b.playCount - a.playCount;
        // 같은 횟수면 최근에 한 것 우선
        const al = a.lastPlayedAt ?? '';
        const bl = b.lastPlayedAt ?? '';
        if (al !== bl) return al < bl ? 1 : -1;
        return byTitle(a, b);
      };
    case 'longestUnplayed':
      return (a: Game, b: Game) => {
        // 아직 안 해본 게임이 가장 앞
        const av = a.lastPlayedAt ?? '';
        const bv = b.lastPlayedAt ?? '';
        if (av === bv) return byTitle(a, b);
        return av < bv ? -1 : 1;
      };
    case 'shortest':
      return (a: Game, b: Game) => {
        const av = a.maxPlaytime ?? Number.MAX_SAFE_INTEGER;
        const bv = b.maxPlaytime ?? Number.MAX_SAFE_INTEGER;
        return av === bv ? byTitle(a, b) : av - bv;
      };
    case 'easiest':
      return (a: Game, b: Game) => {
        const av = a.weight ?? Number.MAX_SAFE_INTEGER;
        const bv = b.weight ?? Number.MAX_SAFE_INTEGER;
        return av === bv ? byTitle(a, b) : av - bv;
      };
    default:
      return (a: Game, b: Game) => {
        const diff = scoreGame(b, f, today, likes) - scoreGame(a, f, today, likes);
        if (diff !== 0) return diff;
        // 동점이면 쉬운 것 우선, 그다음 제목순으로 순서를 안정화한다.
        const aw = a.weight ?? Number.MAX_SAFE_INTEGER;
        const bw = b.weight ?? Number.MAX_SAFE_INTEGER;
        return aw === bw ? byTitle(a, b) : aw - bw;
      };
  }
}

/** 필터 + 정렬. likes는 '하트순' 정렬과 추천 점수 양쪽에 쓰인다. */
export function applyFilter(
  games: Game[],
  f: GameFilter,
  today = new Date(),
  likes: LikeContext = NO_LIKES
): Game[] {
  return games.filter((g) => passesFilter(g, f)).sort(comparator(f.sort, f, today, likes));
}

/* ── 결과 없음 대안 ────────────────────────────────────────────────────────
 * 소장 수가 적어 0건이 자주 발생한다. 빈 화면 대신 조건을 하나씩 완화한 대안을 준다.
 * 완화 순서는 주관성이 큰 축(테마)에서 확실한 제약(인원수) 방향으로 간다 —
 * 인원수는 사용자가 가장 확실히 아는 정보이므로 마지막에만 건드린다. */

export type Relaxation = { label: string; filter: GameFilter; count: number };

export function relaxations(games: Game[], f: GameFilter): Relaxation[] {
  const candidates: { label: string; filter: GameFilter }[] = [];

  // 메커니즘이 가장 세분화된 축이라 제일 먼저 완화한다.
  if (f.mechanics.length)
    candidates.push({ label: '메커니즘 조건 빼기', filter: { ...f, mechanics: [] } });
  if (f.themes.length) candidates.push({ label: '테마 조건 빼기', filter: { ...f, themes: [] } });
  if (f.categories.length)
    candidates.push({ label: '카테고리 조건 빼기', filter: { ...f, categories: [] } });
  if (f.weightRange) candidates.push({ label: '난이도 조건 빼기', filter: { ...f, weightRange: null } });
  if (f.playtimeBand !== null)
    candidates.push({ label: '시간 조건 빼기', filter: { ...f, playtimeBand: null } });
  if (f.playerCount !== null) {
    const n = f.playerCount;
    if (n > 1)
      candidates.push({ label: `${n - 1}명으로 보기`, filter: { ...f, playerCount: n - 1 } });
    candidates.push({ label: `${n + 1}명으로 보기`, filter: { ...f, playerCount: n + 1 } });
  }

  return candidates
    .map((c) => ({ ...c, count: games.filter((g) => passesFilter(g, c.filter)).length }))
    .filter((c) => c.count > 0);
}

/* ── 필터 옵션 집계 ────────────────────────────────────────────────────────
 * 테마가 53종인데 대부분 1개짜리라, 전부 칩으로 깔면 결과 1건짜리 버튼이 늘어선다.
 * 상위만 노출하고 나머지는 '더보기'로 접는다. */

export function countBy(
  games: Game[],
  key: 'categories' | 'themes' | 'mechanics'
): [string, number][] {
  const map = new Map<string, number>();
  for (const g of games) for (const v of g[key]) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
}

/**
 * 각 옵션 칩에 붙는 개수 — "이 태그에 해당하는 게임 수".
 *
 * 다른 축의 필터(인원·시간 등)는 반영하되, 같은 축의 선택 상태는 무시하고
 * 그 옵션 하나만 적용해 센다. "누르면 몇 개가 될지"로 계산하면 선택하는 순간
 * 자기 숫자가 다른 의미(해제 시 개수)로 바뀌어 헷갈린다는 실사용 피드백.
 */
export function optionCounts(
  games: Game[],
  f: GameFilter,
  key: 'categories' | 'themes' | 'mechanics',
  options: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const opt of options) {
    const probe: GameFilter = { ...f, [key]: [opt] };
    out[opt] = games.filter((g) => passesFilter(g, probe)).length;
  }
  return out;
}
