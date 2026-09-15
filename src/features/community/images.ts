import { Platform } from 'react-native';

import { mediaBase, NAS_PREFIX, nasUrl } from '@/lib/media';
import { supabase, supabaseUrl } from '@/lib/supabase';

/** 예전 저장소. NAS로 옮기기 전에 올린 사진들이 여기 남아 있다. */
const LEGACY_BUCKET = 'post-images';

export function postImageUrl(path: string): string | null {
  if (!path) return null;
  const nas = nasUrl(path);
  if (nas) return nas;
  // 접두사가 없으면 NAS로 옮기기 전에 올린 사진이다. 옛 주소를 그대로 유지한다 —
  // 한 번에 이사시키지 않아도 과거 글이 깨지지 않는다.
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/${LEGACY_BUCKET}/${path}`;
}

/** 웹에서만 사진을 고를 수 있다. 네이티브는 이미지 선택기 도입 후 열린다. */
export const canPickImage = Platform.OS === 'web';

/** 파일 선택창. 취소하면 빈 배열. multi=false면 한 장만 고른다. */
export function pickImages(multi = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multi;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    // 취소를 감지할 표준 이벤트가 없다. 창이 닫히며 포커스가 돌아오면 빈 결과로 끝낸다.
    window.addEventListener('focus', () => setTimeout(() => resolve([]), 500), { once: true });
    input.click();
  });
}

/**
 * 업로드 전에 긴 변을 1600px으로 줄이고 webp로 굽는다.
 *
 * 원본은 폰 사진 한 장이 3~5MB다. 그대로 올리면 NAS는 버티더라도 피드를 한 번
 * 넘길 때마다 수십 MB가 오가고, 밖에서 볼 때는 그게 곧 대기 시간이 된다.
 * 리사이즈하면 장당 150~250KB다.
 */
async function shrink(file: File): Promise<Blob> {
  // 움직이는 이미지는 손대지 않는다. 캔버스는 한 프레임만 그리므로, 리사이즈하는 순간
  // GIF·APNG가 정지 사진이 된다(움직이지 않는 '움짤'이 올라간 원인이었다).
  if (/gif|apng/i.test(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.82));
  // toBlob이 null을 주는 환경(webp 미지원)에서는 원본을 그대로 올린다.
  return blob ?? file;
}

/** 리사이즈를 건너뛰는 움직이는 이미지의 상한. 이걸 넘으면 피드 스크롤이 무거워진다. */
const MAX_ANIMATED_BYTES = 8 * 1024 * 1024;

/**
 * NAS에 사진 한 장을 올린다. 반환값은 DB에 그대로 넣을 경로(`nas/2026/08/…`).
 *
 * 인증은 Supabase 액세스 토큰으로 한다 — NAS의 미디어 서버가 그 토큰으로
 * "이 사람이 모임 회원인가"를 Supabase에 직접 물어본다. NAS가 비밀번호를
 * 따로 들고 있지 않아도 되는 이유다.
 */
export async function uploadPostImage(file: File): Promise<string> {
  const blob = await shrink(file);

  if (blob === file && blob.size > MAX_ANIMATED_BYTES) {
    throw new Error(
      `움직이는 이미지는 ${Math.round(MAX_ANIMATED_BYTES / 1024 / 1024)}MB까지 올릴 수 있어요. (지금 ${Math.round(blob.size / 1024 / 1024)}MB)`
    );
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch(`${mediaBase}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // 확장자는 서버가 이 값만 보고 정한다. 파일명은 보내지 않는다.
      'Content-Type': blob.type || 'image/webp',
    },
    body: blob,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `사진 업로드에 실패했어요 (${res.status})`);
  }

  const { path } = (await res.json()) as { path: string };
  return `${NAS_PREFIX}${path}`;
}
