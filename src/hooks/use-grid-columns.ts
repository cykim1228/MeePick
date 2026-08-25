import { useCallback, useState } from 'react';
import { Platform, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

/**
 * 웹 셸이 태블릿 가로(≥1024px)에서 #root에 CSS zoom을 건다 (+html.tsx).
 * 그러면 onLayout·창 너비는 시각 픽셀로 오는데 스타일의 width는 논리 픽셀로 적용되어,
 * 시각 픽셀 그대로 카드 폭을 계산하면 행이 zoom 배율만큼 오른쪽으로 삐져나간다.
 * 그래서 측정값을 zoom으로 나눠 논리 픽셀로 되돌린다.
 */
function layoutZoom(): number {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return 1;
  const root = document.getElementById('root');
  if (!root) return 1;
  const z = Number.parseFloat(getComputedStyle(root).zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/**
 * 그리드 컬럼 수를 목표 카드 폭 기준으로 정한다.
 *
 * 폭은 **컨테이너 실측값을 우선**하고, 아직 측정되지 않았으면 창 너비로 대신한다.
 * 컨테이너를 우선하는 이유는 상세 패널이 열리면 목록 영역이 창보다 380px 좁아지기 때문이고,
 * 창 너비를 대체값으로 두는 이유는 onLayout이 늦거나 발화하지 않는 환경에서
 * 화면이 통째로 비어 버리는 것을 막기 위해서다. 측정 전에 그리지 않는 편이 깔끔해 보이지만,
 * 한 번이라도 측정이 오지 않으면 사용자는 빈 화면만 보게 된다.
 */
/**
 * 카드가 이보다 좁아지면 표지가 우표만 해지고 제목이 두 줄로 접힌다.
 * 이 선을 지킬 수 있는 한 폰에서도 2열을 유지한다 — 1열은 한 화면에 한두 개만 보여
 * '훑어보고 고르는' 화면의 목적을 잃는다.
 */
const MIN_CARD_WIDTH = 140;
/** 목록의 좌우 여백(Spacing.four × 2) + 카드 사이 간격(Spacing.three) */
const GUTTER = 24 * 2 + 16;

export function useGridColumns(targetCardWidth = 240, reservedWidth = 0) {
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width / layoutZoom();
    // 소수점 흔들림으로 리스트가 재생성되지 않도록 정수로 고정한다.
    setMeasured((prev) => (Math.abs(prev - next) < 1 ? prev : Math.round(next)));
  }, []);

  // 대체값에서도 상세 패널이 차지하는 폭을 빼준다. 측정이 오지 않는 환경에서
  // 패널을 열면 목록이 좁아지는데 컬럼 수는 그대로여서 카드가 눌리기 때문이다.
  const width =
    measured || Math.max(targetCardWidth, windowWidth / layoutZoom() - reservedWidth);

  let columns = Math.max(1, Math.floor(width / targetCardWidth));
  // 목표 폭에 못 미쳐도 카드가 최소 폭을 지킬 수 있으면 2열로 올린다.
  if (columns === 1 && width >= MIN_CARD_WIDTH * 2 + GUTTER) columns = 2;

  return { onLayout, width, columns };
}
