import { useCallback, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';

/**
 * 그리드 컬럼 수를 목표 카드 폭 기준으로 정한다.
 *
 * 폭은 **컨테이너 실측값을 우선**하고, 아직 측정되지 않았으면 창 너비로 대신한다.
 * 컨테이너를 우선하는 이유는 상세 패널이 열리면 목록 영역이 창보다 380px 좁아지기 때문이고,
 * 창 너비를 대체값으로 두는 이유는 onLayout이 늦거나 발화하지 않는 환경에서
 * 화면이 통째로 비어 버리는 것을 막기 위해서다. 측정 전에 그리지 않는 편이 깔끔해 보이지만,
 * 한 번이라도 측정이 오지 않으면 사용자는 빈 화면만 보게 된다.
 */
export function useGridColumns(targetCardWidth = 240, reservedWidth = 0) {
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    // 소수점 흔들림으로 리스트가 재생성되지 않도록 정수로 고정한다.
    setMeasured((prev) => (Math.abs(prev - next) < 1 ? prev : Math.round(next)));
  }, []);

  // 대체값에서도 상세 패널이 차지하는 폭을 빼준다. 측정이 오지 않는 환경에서
  // 패널을 열면 목록이 좁아지는데 컬럼 수는 그대로여서 카드가 눌리기 때문이다.
  const width = measured || Math.max(targetCardWidth, windowWidth - reservedWidth);

  return { onLayout, width, columns: Math.max(1, Math.floor(width / targetCardWidth)) };
}
