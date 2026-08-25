import { Typography, TypographyCompact } from '@/constants/theme';

import { useBreakpoint } from './use-breakpoint';

/**
 * 화면 크기에 맞는 글자 크기 토큰.
 *
 * StyleSheet는 정적이라 미디어 쿼리처럼 자동으로 바뀌지 않는다. 큰 글자가 쓰이는 곳에서
 * 이 훅으로 받아 인라인으로 얹는다 — 폰에서 32px 제목이 화면 절반을 먹는 것을 막는다.
 *
 * 작은 글자(캡션·본문)까지 전부 갈아끼울 필요는 없다. 제목·부제처럼 **큰 것부터** 적용한다.
 */
export function useType(): typeof Typography | typeof TypographyCompact {
  return useBreakpoint() === 'compact' ? TypographyCompact : Typography;
}
