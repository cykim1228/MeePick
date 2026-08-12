import type { Game, GameFilter, SortKey } from './types';

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

  // 최소 시간이 상한을 넘으면 그 시간 안에 끝날 수 없다.
  if (f.maxPlaytime !== null) {
    if (game.minPlaytime === null) return false;
    if (game.minPlaytime > f.maxPlaytime) return false;
  }

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

export function scoreGame(game: Game, f: GameFilter, today = new Date()): number {
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

  if (f.maxPlaytime !== null) {
    if (game.maxPlaytime !== null && game.maxPlaytime <= f.maxPlaytime) score += 20;
    else if (game.minPlaytime !== null && game.minPlaytime <= f.maxPlaytime) score += 8;
  }

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

  // 추정값으로 채운 게임은 확신이 낮으므로 동점일 때 뒤로 보낸다.
  if (game.isEstimated) score -= 3;

  return score;
}

/* ── 정렬 ──────────────────────────────────────────────────────────────── */

const byTitle = (a: Game, b: Game) => a.titleKo.localeCompare(b.titleKo, 'ko');

function comparator(sort: SortKey, f: GameFilter, today: Date) {
  switch (sort) {
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
        const diff = scoreGame(b, f, today) - scoreGame(a, f, today);
        if (diff !== 0) return diff;
        // 동점이면 쉬운 것 우선, 그다음 제목순으로 순서를 안정화한다.
        const aw = a.weight ?? Number.MAX_SAFE_INTEGER;
        const bw = b.weight ?? Number.MAX_SAFE_INTEGER;
        return aw === bw ? byTitle(a, b) : aw - bw;
      };
  }
}

export function applyFilter(games: Game[], f: GameFilter, today = new Date()): Game[] {
  return games.filter((g) => passesFilter(g, f)).sort(comparator(f.sort, f, today));
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
  if (f.maxPlaytime !== null)
    candidates.push({ label: '시간 조건 빼기', filter: { ...f, maxPlaytime: null } });
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
