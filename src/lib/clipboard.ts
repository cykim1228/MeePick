import { Platform } from 'react-native';

/**
 * 클립보드에 텍스트를 넣는다. 성공하면 true.
 *
 * expo-clipboard를 넣지 않은 이유: 이 앱은 웹으로만 배포되고, 웹에서는 브라우저 API가
 * 이미 답이다. 패키지 하나를 더 얹으면 네이티브 빌드까지 따라오는데 쓰이지도 않는다.
 *
 * `navigator.clipboard`는 보안 컨텍스트(https·localhost)에서만 있다. 지금 모임은 LAN의
 * http 주소로도 쓰기 때문에, 없을 때를 대비해 예전 방식(execCommand)을 남겨 둔다 —
 * 이 경우가 오히려 흔하다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한이 막혔거나 보안 컨텍스트가 아니다. 아래로 넘어간다.
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    // 화면 밖에 두되 display:none은 쓰지 않는다 — 선택이 안 되어 복사도 안 된다.
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** 지금 이 앱이 열려 있는 주소의 오리진. 초대 링크를 만들 때 쓴다. */
export function appOrigin(): string {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return '';
  return location.origin;
}
