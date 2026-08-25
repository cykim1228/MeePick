/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// 색은 의미 기반 이름을 쓴다. 화면에서 원시 색상값을 직접 참조하면 의미가 바뀔 때 전수 수정이 필요하다.
//
// 팔레트는 보드게임 테이블의 웜 톤 — 종이 보드의 크림, 테라코타(미플), 펠트 그린.
// 템플릿 기본 흑백은 도구처럼 보이고, 이 앱은 놀 거리를 고르는 앱이다.
export const Colors = {
  light: {
    text: '#241E15',
    /** 화면 바탕 — 따뜻한 종이색 */
    background: '#F7F2E9',
    /** 카드·입력창 표면 */
    backgroundElement: '#FFFFFF',
    /** 눌림·선택·표지 대체 배경 */
    backgroundSelected: '#EDE5D6',
    textSecondary: '#6F6455',
    border: '#E0D6C4',
    /** 주요 액션 — 테라코타 */
    accent: '#C24E2B',
    onAccent: '#FFF6EE',
    /** 베스트 인원 표시 — 펠트 그린 */
    badgeBest: '#207D53',
    /** 추천 인원 표시 — 베스트(그린)와 한눈에 구분되는 블루 */
    badgeRecommended: '#2B6C9E',
    /** 아직 안 해본 게임 — 앰버 */
    badgeNew: '#A96A12',
    /** 노션에 없어 채워 넣은 추정값 */
    badgeEstimated: '#8B8272',
    danger: '#B3261E',
    /** 상세 태그 — 기준(필드)별 고정색. 인원은 badgeBest/badgeRecommended를 재사용한다. */
    tagTime: '#3E7C7B',
    tagWeight: '#7B5EA7',
    tagTheme: '#5C8A3D',
    tagMechanic: '#A34E68',
  },
  dark: {
    text: '#F2EBDF',
    background: '#161310',
    backgroundElement: '#211D17',
    backgroundSelected: '#2E2820',
    textSecondary: '#A99E8C',
    border: '#3B342A',
    accent: '#E58A63',
    onAccent: '#33150A',
    badgeBest: '#63C695',
    badgeRecommended: '#7FB5DC',
    badgeNew: '#DFA45C',
    badgeEstimated: '#9C9384',
    danger: '#F2A099',
    tagTime: '#82C7C5',
    tagWeight: '#B9A6DF',
    tagTheme: '#A9CB82',
    tagMechanic: '#DE94AC',
  },
} as const;

export const Radius = { sm: 8, md: 12, lg: 20, full: 999 } as const;

/**
 * 태블릿은 팔 길이 거리에서 여럿이 함께 본다.
 * 폰 앱 기준(body 15~16)보다 한 단계 크게 잡고, 본문을 17 아래로 내리지 않는다.
 */
/**
 * 제목 계열은 Jua(둥글고 도톰한 한글 디스플레이 폰트) — 보드게임 박스 타이포 감성.
 * 본문·캡션은 시스템 폰트를 유지한다. 장문 가독성은 시스템 폰트가 낫다.
 * Jua는 400 단일 굵기라 제목에 fontWeight를 얹지 않는다(가짜 볼드 방지).
 */
export const Typography = {
  display: { fontSize: 32, lineHeight: 42, fontWeight: '400', fontFamily: 'Jua_400Regular' },
  title: { fontSize: 24, lineHeight: 34, fontWeight: '400', fontFamily: 'Jua_400Regular' },
  subtitle: { fontSize: 19, lineHeight: 28, fontWeight: '400', fontFamily: 'Jua_400Regular' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  /** 필터 그룹명 같은 섹션 라벨. 본문과 구분되도록 작고 단단하게. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.5 },
} as const;

/**
 * 폰에서 쓰는 한 단계 작은 크기.
 *
 * 위 Typography는 태블릿을 팔 길이에서 보는 기준이라, 그대로 폰에 쓰면 제목이 두 줄로
 * 접히고 목록 한 줄에 들어갈 정보가 줄어든다. 폰은 눈에서 30cm라 작아도 읽힌다.
 * 화면 코드는 `useType()`으로 받아 쓰고, 여기 숫자를 직접 참조하지 않는다.
 */
export const TypographyCompact = {
  display: { fontSize: 22, lineHeight: 30, fontWeight: '400', fontFamily: 'Jua_400Regular' },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '400', fontFamily: 'Jua_400Regular' },
  subtitle: { fontSize: 16, lineHeight: 23, fontWeight: '400', fontFamily: 'Jua_400Regular' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '400' },
  label: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.4 },
} as const;

/** 공용 기기에서 서서 누르는 경우가 있어 주요 액션은 크게 잡는다. */
export const TouchTarget = { min: 44, primary: 56 } as const;

/**
 * 카드를 배경에서 떼어 놓는 그림자. 테두리만으로는 목록이 표처럼 보인다.
 * iOS/웹은 shadow*, 안드로이드는 elevation을 봐서 둘 다 준다.
 */
export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
