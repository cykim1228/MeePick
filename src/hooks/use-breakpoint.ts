import { useWindowDimensions } from 'react-native';

/**
 * React Native에는 CSS 미디어 쿼리가 없어 반응형을 런타임 값 분기로 구현한다.
 * 기준을 한 곳에 모아두지 않으면 화면마다 다른 숫자를 쓰게 된다.
 *
 * Dimensions.get()은 회전에 반응하지 않으므로 쓰지 않는다.
 * 태블릿은 거치 방향이 바뀌므로 useWindowDimensions가 필수다.
 */
export type Breakpoint = 'compact' | 'medium' | 'expanded';

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  if (width >= 1024) return 'expanded'; // 태블릿 가로 — 기본 설계 기준
  // 600은 '폰의 끝'이다. 768은 아이패드 세로 폭이라 태블릿의 시작이지 폰의 경계가 아니고,
  // 그 값을 쓰면 430~768 구간(폴더블·소형 태블릿)이 통째로 폰 취급을 받아 글자가 과하게 작아진다.
  if (width >= 600) return 'medium'; // 태블릿 세로, 소형 태블릿
  return 'compact'; // 폰
}

/** 브레이크포인트별 값 선택. 화면 코드는 이 헬퍼만 쓴다. */
export function useResponsive<T>(values: Record<Breakpoint, T>): T {
  return values[useBreakpoint()];
}
