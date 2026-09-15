import type { Database } from '@/lib/database.types';

import type { Game } from './types';

export type GameRow = Database['public']['Tables']['games']['Row'];

/** 앱에서 직접 입력·수정할 수 있는 항목. 노션이 채우는 나머지 필드는 건드리지 않는다. */
export type GameInput = Pick<
  Game,
  | 'titleKo'
  | 'titleEn'
  | 'owned'
  | 'playerCounts'
  | 'recommendedCounts'
  | 'bestCount'
  | 'supports10Plus'
  | 'minPlaytime'
  | 'maxPlaytime'
  | 'weight'
  | 'categories'
  | 'themes'
  | 'mechanics'
  | 'imagePath'
  | 'notes'
  | 'ruleVideoUrl'
>;

/**
 * 도메인 타입 → DB 행. toGame의 역방향이며 여기서만 변환한다.
 *
 * 사용자가 직접 입력한 값이므로 is_estimated는 항상 false로 되돌린다 —
 * 추정값이던 게임을 사람이 고쳤다면 더는 추정이 아니다.
 */
export function toGameRow(input: GameInput): Partial<GameRow> {
  return {
    title_ko: input.titleKo.trim(),
    title_en: input.titleEn?.trim() || null,
    owned: input.owned,
    player_counts: input.playerCounts,
    recommended_counts: input.recommendedCounts,
    best_count: input.bestCount,
    supports_10_plus: input.supports10Plus,
    min_playtime: input.minPlaytime,
    max_playtime: input.maxPlaytime,
    weight: input.weight,
    categories: input.categories,
    themes: input.themes,
    mechanics: input.mechanics,
    image_path: input.imagePath,
    notes: input.notes?.trim() || null,
    rule_video_url: input.ruleVideoUrl?.trim() || null,
    is_estimated: false,
    estimated_fields: [],
  };
}

/**
 * DB 행 → 도메인 타입. 변환은 이 함수 한 곳에서만 한다.
 * 배열은 null을 빈 배열로 낮추지만, 숫자·문자열은 null을 유지한다 —
 * '값이 0'과 '값이 없음'을 구분하지 못하면 추정값과 실측값이 섞인다.
 */
export function toGame(row: GameRow): Game {
  return {
    id: row.id,
    titleKo: row.title_ko,
    titleEn: row.title_en,
    owned: row.owned,

    playerCounts: row.player_counts ?? [],
    recommendedCounts: row.recommended_counts ?? [],
    bestCount: row.best_count,
    supports10Plus: row.supports_10_plus,

    minPlaytime: row.min_playtime,
    maxPlaytime: row.max_playtime,
    weight: row.weight === null ? null : Number(row.weight),

    categories: row.categories ?? [],
    themes: row.themes ?? [],
    mechanics: row.mechanics ?? [],

    yearPublished: row.year_published,
    imageFile: row.image_file,
    imagePath: row.image_path,
    // 마이그레이션 전(컬럼 없음)에는 undefined가 와서 null로 낮춘다
    ruleVideoUrl: row.rule_video_url ?? null,
    description: row.description,
    notes: row.notes,

    isEstimated: row.is_estimated,
    estimatedFields: row.estimated_fields ?? [],

    lastPlayedAt: row.last_played_at,
    // 횟수는 plays 집계에서 온다. 목록을 불러오는 games/hooks가 병합하며, 여기서는 기본값만 둔다.
    playCount: 0,
  };
}
