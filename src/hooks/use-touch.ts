import { TouchTarget, TouchTargetCompact } from '@/constants/theme';

import { useBreakpoint } from './use-breakpoint';

/**
 * 화면 크기에 맞는 손가락 크기 토큰. useType과 같은 이유로 훅이다 —
 * StyleSheet는 정적이라 미디어 쿼리처럼 자동으로 바뀌지 않는다.
 */
export function useTouch(): typeof TouchTarget | typeof TouchTargetCompact {
  return useBreakpoint() === 'compact' ? TouchTargetCompact : TouchTarget;
}
