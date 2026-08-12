import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, View, StyleSheet, Text } from 'react-native';

import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useTheme } from '@/hooks/use-theme';

/**
 * 웹용 상단 바.
 *
 * 템플릿 기본값은 화면 위에 떠 있는(position: absolute) 알약 모양이라 콘텐츠 첫 줄을 가리고,
 * 웹사이트처럼 보인다. 흐름 안에 있는 앱 바로 바꿔 콘텐츠가 그 아래에서 시작하게 한다.
 * 네이티브에서는 app-tabs.tsx의 NativeTabs가 쓰이므로 이 파일은 웹에만 영향을 준다.
 */
export default function AppTabs() {
  return (
    <Tabs style={styles.tabs}>
      <TabList asChild>
        <AppBar>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>추천</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>전체</TabButton>
          </TabTrigger>
          <TabTrigger name="wishlist" href="/wishlist" asChild>
            <TabButton>위시</TabButton>
          </TabTrigger>
          <TabTrigger name="history" href="/history" asChild>
            <TabButton>기록</TabButton>
          </TabTrigger>
          <TabTrigger name="hall-of-fame" href="/hall-of-fame" asChild>
            <TabButton>전당</TabButton>
          </TabTrigger>
        </AppBar>
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const c = useTheme();
  return (
    <Pressable {...props} style={({ pressed }) => [pressed && styles.pressed]}>
      <View
        style={[
          styles.tabButton,
          { backgroundColor: isFocused ? c.accent : 'transparent' },
        ]}>
        <Text style={[styles.tabLabel, { color: isFocused ? c.onAccent : c.textSecondary }]}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

export function AppBar(props: TabListProps) {
  const c = useTheme();
  // 폰 폭에서는 브랜드 텍스트가 탭 5개를 밀어내 줄이 깨진다. 주사위만 남긴다.
  const compact = useBreakpoint() === 'compact';
  return (
    <View
      {...props}
      style={[styles.bar, { backgroundColor: c.background, borderBottomColor: c.border }]}>
      <Text style={[styles.brand, { color: c.accent }]} numberOfLines={1}>
        {compact ? '🎲' : '🎲 MeePick'}
      </Text>
      <View style={[styles.tabGroup, compact && styles.tabGroupCompact]}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flex: 1 },
  slot: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 64,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { ...Typography.subtitle, marginRight: 'auto' },
  tabGroup: { flexDirection: 'row', gap: Spacing.one },
  // 폰에서는 탭 5개가 남은 폭을 고르게 나눠 갖는다
  tabGroupCompact: { flex: 1, justifyContent: 'space-evenly', gap: 0 },
  tabButton: {
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
  },
  tabLabel: { ...Typography.body, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
