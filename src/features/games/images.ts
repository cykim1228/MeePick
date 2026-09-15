import { nasUrl } from '@/lib/media';
import { supabaseUrl } from '@/lib/supabase';

import type { Game } from './types';

const BUCKET = 'game-images';

/**
 * 저장소 객체 키 → 공개 URL. 기록 화면처럼 Game 객체 없이 경로만 있을 때 쓴다.
 *
 * 표지는 두 곳에 있다 — 노션에서 임포트한 것은 Supabase Storage에, 앱에서 올린 것은 NAS에.
 * 게시글 사진과 같은 규칙(`nas/` 접두사)으로 가른다.
 */
export function storageImageUrl(path: string | null): string | null {
  if (!path) return null;
  const nas = nasUrl(path);
  if (nas) return nas;
  if (!supabaseUrl) return null;
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
