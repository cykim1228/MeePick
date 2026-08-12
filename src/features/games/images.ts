import { supabaseUrl } from '@/lib/supabase';

import type { Game } from './types';

const BUCKET = 'game-images';

/** 저장소 객체 키 → 공개 URL. 기록 화면처럼 Game 객체 없이 경로만 있을 때 쓴다. */
export function storageImageUrl(path: string | null): string | null {
  if (!path || !supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path)}`;
}

/**
 * 표지 이미지 URL. 업로드하지 않은 게임은 null이다.
 *
 * `imageFile`(노션 원본 파일명)이 아니라 `imagePath`(저장소 객체 키)를 쓴다.
 * 원본 파일명은 로컬에만 있고 저장소에는 게임 id로 올라간다.
 */
export function gameImageUrl(game: Game): string | null {
  return storageImageUrl(game.imagePath);
}
