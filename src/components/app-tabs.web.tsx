import { usePathname } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { useEffect } from 'react';
import { Pressable, View, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon, type IconName } from '@/components/icon';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { refreshActivity, useUnread } from '@/features/community/activity';
import { useMyProfile } from '@/features/community/hooks';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useTheme } from '@/hooks/use-theme';

/**
 * 웹 내비게이션.
 *
 * 데스크탑은 상단 바, 폰·태블릿은 **하단 바**다. 손에 들고 쓰는 화면에서 상단 탭은
 * 엄지가 닿지 않는다 — 모바일 앱들이 하단을 쓰는 이유이며, 태블릿 가로 거치에서도
 * 아래쪽이 훨씬 가깝다. 마우스를 쓰는 데스크탑에서는 거리가 무의미하므로 상단이 낫다.
 *
 * 네이티브에서는 app-tabs.tsx의 NativeTabs가 쓰이므로 이 파일은 웹에만 영향을 준다.
 */
type TabDef = {
  name: string;
  href: string;
  label: string;
  icon: IconName;
  onPhone: boolean;
  /** 바에는 절대 안 보이지만 이동은 되는 화면(관리 등). 트리거를 빼면 그 경로가 죽는다. */
  offBar?: boolean;
};

/**
 * 하단 바에서는 5칸(피드·일정·추천·기록 + 프로필)만 남긴다.
 * 8칸을 늘어놓으면 칸마다 아이콘이 작아지고 글자가 붙어 오탭이 잦다 —
 * 모바일 앱의 하단 탭이 대개 4~5개인 이유다.
 * 빠진 전체·위시·전당은 프로필 화면의 '모든 메뉴'로 들어간다.
 * 상단 바(데스크탑)는 가로가 남으므로 전부 보여준다.
 */
const TABS: TabDef[] = [
  { name: 'feed', href: '/feed', label: '피드', icon: 'home', onPhone: true },
  { name: 'meetups', href: '/meetups', label: '일정', icon: 'calendar', onPhone: true },
  { name: 'home', href: '/', label: '추천', icon: 'dice', onPhone: true },
  { name: 'explore', href: '/explore', label: '전체', icon: 'grid', onPhone: false },
  { name: 'wishlist', href: '/wishlist', label: '위시', icon: 'star', onPhone: false },
  { name: 'history', href: '/history', label: '기록', icon: 'list', onPhone: true },
  { name: 'hall-of-fame', href: '/hall-of-fame', label: '전당', icon: 'trophy', onPhone: false },
  // 프로필도 그냥 탭이다 — 팝업으로 띄우면 하단 바가 덮여 다른 탭으로 바로 못 간다.
  { name: 'profile', href: '/profile', label: '프로필', icon: 'user', onPhone: true },
  // 관리 화면은 프로필의 메뉴로만 들어간다 — 모임장 한 명 때문에 모두의 바를 늘릴 이유가 없다.
  { name: 'admin-users', href: '/admin-users', label: '사용자 관리', icon: 'user', onPhone: false, offBar: true },
  { name: 'admin-posts', href: '/admin-posts', label: '피드 관리', icon: 'list', onPhone: false, offBar: true },
  // 초대 링크가 도착하는 곳. 바에는 없지만 등록은 해야 그 주소로 들어올 수 있다.
  { name: 'join', href: '/join', label: '초대', icon: 'user', onPhone: false, offBar: true },
];

export default function AppTabs() {
  const atBottom = useBreakpoint() !== 'expanded';
  const { isMember } = useMyProfile();
  const unread = useUnread(isMember);
  // 화면을 옮길 때마다 다시 확인한다. 주기적으로 폴링하면 배터리만 먹는다 —
  // 어차피 점을 보는 순간은 사람이 앱을 만지고 있을 때다.
  const pathname = usePathname();
  useEffect(() => {
    if (isMember) void refreshActivity();
  }, [pathname, isMember]);

  // 감추는 탭도 TabList에는 남긴다 — 트리거를 빼면 그 경로로 이동할 수 없다.
  // 프로필의 '모든 메뉴'가 그 경로들을 열어야 하므로 등록은 유지하고 표시만 끈다.
  const triggers = TABS.map((t) => (
    // href는 생성된 라우트 타입이라 문자열 배열에서 오면 좁혀지지 않는다.
    <TabTrigger key={t.name} name={t.name} href={t.href as '/feed'} asChild>
      <TabButton
        icon={t.icon}
        hidden={t.offBar || (atBottom && !t.onPhone)}
        unread={t.name === 'feed' ? unread.feed : t.name === 'meetups' ? unread.meetups : false}>
        {t.label}
      </TabButton>
    </TabTrigger>
  ));

  // TabList와 TabSlot의 **순서**가 바의 위치를 정한다. 순서만 바꾸면 같은 트리거를 재사용할 수 있다.
  return (
    <Tabs style={styles.tabs}>
      {atBottom ? (
        <>
          <TabSlot style={styles.slot} />
          <TabList asChild>
            <BottomBar>{triggers}</BottomBar>
          </TabList>
        </>
      ) : (
        <>
          <TabList asChild>
            <TopBar>{triggers}</TopBar>
          </TabList>
          <TabSlot style={styles.slot} />
        </>
      )}
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  icon,
  hidden,
  unread,
  ...props
}: TabTriggerSlotProps & { icon?: IconName; hidden?: boolean; unread?: boolean }) {
  const c = useTheme();
  const atBottom = useBreakpoint() !== 'expanded';
  const { profile } = useMyProfile();

  if (hidden) return <Pressable {...props} style={styles.hidden} />;

  // 프로필 탭은 아이콘 대신 내 사진을 쓴다 — SNS의 표준이고, 로그인 상태가 한눈에 보인다.
  const isProfile = icon === 'user';

  if (atBottom) {
    // 하단 바는 아이콘 위·글자 아래. 알약 배경 대신 색으로만 선택을 표시한다 —
    // 좁은 폭에서 칸마다 배경을 칠하면 답답해 보인다.
    const tint = isFocused ? c.accent : c.textSecondary;
    return (
      <Pressable {...props} style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}>
        <View>
          {isProfile && profile ? (
            <Avatar profile={profile} size={22} />
          ) : (
            icon && <Icon name={icon} size={22} color={tint} />
          )}
          {/* 안 읽은 것이 있다는 점. 숫자를 세지 않는다 — 몇 개인지가 아니라
              "뭔가 있다"만 알면 들어와 보게 된다. */}
          {unread && <View style={[styles.dot, { backgroundColor: c.accent, borderColor: c.background }]} />}
        </View>
        <Text style={[styles.bottomLabel, { color: tint }]} numberOfLines={1}>
          {children}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable {...props} style={({ pressed }) => [pressed && styles.pressed]}>
      <View style={[styles.tabButton, { backgroundColor: isFocused ? c.accent : 'transparent' }]}>
        <View>
          {isProfile && profile ? (
            <Avatar profile={profile} size={20} />
          ) : (
            icon && <Icon name={icon} size={18} color={isFocused ? c.onAccent : c.textSecondary} />
          )}
          {unread && (
            <View
              style={[
                styles.dot,
                { backgroundColor: isFocused ? c.onAccent : c.accent, borderColor: isFocused ? c.accent : c.background },
              ]}
            />
          )}
        </View>
        <Text style={[styles.tabLabel, { color: isFocused ? c.onAccent : c.textSecondary }]}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

export function TopBar(props: TabListProps) {
  const c = useTheme();
  return (
    <View
      {...props}
      style={[styles.bar, { backgroundColor: c.background, borderBottomColor: c.border }]}>
      <Text style={[styles.brand, { color: c.accent }]} numberOfLines={1}>
        MeePick
      </Text>
      <View style={styles.tabGroup}>{props.children}</View>
    </View>
  );
}

export function BottomBar(props: TabListProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      style={[
        styles.bottomBar,
        {
          backgroundColor: c.background,
          borderTopColor: c.border,
          // 홈 인디케이터·제스처 영역만큼 띄운다. 안 띄우면 마지막 탭이 눌리지 않는다.
          paddingBottom: insets.bottom,
        },
      ]}>
      {props.children}
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
    paddingHorizontal: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { ...Typography.subtitle, marginRight: 'auto', letterSpacing: 0.3 },
  tabGroup: { flexDirection: 'row', gap: Spacing.one },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
  },
  tabLabel: { ...Typography.body, fontWeight: '600' },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomItem: {
    flex: 1,
    minHeight: 52,
    paddingVertical: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bottomLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  dot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  hidden: { display: 'none' },
  pressed: { opacity: 0.6 },
});
