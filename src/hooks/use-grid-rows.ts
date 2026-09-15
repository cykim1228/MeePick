import { useMemo } from 'react';

import type { Game } from '@/features/games/types';

/**
 * 격자의 마지막 줄을 빈 칸으로 메운다.
 *
 * 카드에 픽셀 폭을 직접 주는 대신 칸을 `flex: 1`로 두면, 줄은 **언제나 정확히** 컨테이너를
 * 채운다 — 폭을 몇 픽셀 잘못 재도 카드 크기가 미세하게 달라질 뿐 오른쪽이 비지 않는다.
 * 폭 계산이 조금이라도 어긋나면 그만큼 여백이 남던 방식과 다른 점이 이것이다.
 *
 * 대신 마지막 줄에 카드가 모자라면 남은 카드가 줄 전체로 늘어난다. 그래서 빈 칸을 채워
 * 자리를 잡아 준다 — 화면에는 아무것도 그리지 않지만 폭은 한 칸만큼 차지한다.
 */
export type GridCell = Game | null;

export function useGridRows(games: Game[], columns: number): GridCell[] {
  return useMemo(() => {
    if (columns <= 1) return games;
    const rest = games.length % columns;
    if (rest === 0) return games;
    return [...games, ...(Array.from({ length: columns - rest }, () => null) as GridCell[])];
  }, [games, columns]);
}

/** 빈 칸은 id가 없으므로 자리 번호로 키를 만든다. */
export function gridKey(cell: GridCell, index: number): string {
  return cell ? cell.id : `blank-${index}`;
}
