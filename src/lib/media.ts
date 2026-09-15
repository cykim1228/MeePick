import { Platform } from 'react-native';

/**
 * NAS에 올린 파일의 표식.
 *
 * DB에는 경로만 들어 있고, 그 경로가 NAS 것인지 Supabase Storage 것인지 구별할 방법이
 * 필요하다. 생김새로 짐작할 수도 있지만 그런 눈치는 나중에 반드시 틀린다.
 * 접두사를 붙여 대놓고 표시한다.
 */
export const NAS_PREFIX = 'nas/';

/**
 * 사진이 어디서 오는지.
 *
 * 배포본은 **자기 오리진의 `/media`** 를 쓴다. nginx가 NAS의 Photo/Server 폴더를 그 경로로
 * 서빙하며, 같은 오리진이라 https 페이지에서 혼합 콘텐츠로 막힐 일이 없다.
 * 개발 서버(8081)에는 그 경로가 없으므로 `.env`의 NAS 주소로 우회한다.
 */
// 개발용 주소는 개발 쪽 갈래 안에서만 읽는다 — 배포 빌드에서는 이 갈래가 통째로 지워져,
// .env에 적은 집 안 주소가 공개 번들에 실리지 않는다.
export const mediaBase =
  !__DEV__ && Platform.OS === 'web'
    ? '/media'
    : (process.env.EXPO_PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/$/, '') || '/media';

/** `nas/…` 경로면 NAS 주소를 붙여 돌려준다. 아니면 null — 부르는 쪽이 옛 저장소로 넘긴다. */
export function nasUrl(path: string): string | null {
  if (!path.startsWith(NAS_PREFIX)) return null;
  return `${mediaBase}/${path.slice(NAS_PREFIX.length)}`;
}
