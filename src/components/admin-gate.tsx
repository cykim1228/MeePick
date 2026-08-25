import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { LoadingView } from '@/components/state-views';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useMyProfile } from '@/features/community/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/**
 * 관리 화면 앞의 문.
 *
 * 화면을 가리는 것은 편의일 뿐 보안이 아니다 — 실제 차단은 DB 정책(is_admin())이 한다.
 * 관리자가 아닌 사람이 주소를 직접 쳐도, 삭제·권한 변경은 서버에서 거부된다.
 */
export function AdminGate({ children }: PropsWithChildren) {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const { profile, loading } = useMyProfile();

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <LoadingView />
      </View>
    );
  }

  if (!profile?.isAdmin) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <View style={styles.center}>
          <Icon name="lock" size={40} color={c.textSecondary} />
          <Text style={[t.title, styles.centerText, { color: c.text }]}>모임장만 볼 수 있어요</Text>
          <Text style={[t.body, styles.centerText, { color: c.textSecondary }]}>
            사용자·피드 관리는 모임장 계정에서만 열립니다.
          </Text>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

/** 관리 화면 공통 머리말 — 뒤로 가기가 있어야 탭 없이 들어온 화면에서 빠져나갈 수 있다. */
export function AdminHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const c = useTheme();
  const t = useType();
  const router = useRouter();

  return (
    <View style={[styles.head, { borderBottomColor: c.border }]}>
      <Pressable
        onPress={() => router.push('/profile')}
        accessibilityRole="button"
        accessibilityLabel="프로필로 돌아가기"
        style={styles.backButton}>
        <View style={styles.flip}>
          <Icon name="chevronRight" size={20} color={c.text} />
        </View>
      </Pressable>
      <View style={styles.headText}>
        <Text style={[t.subtitle, { color: c.text }]}>{title}</Text>
        {!!subtitle && <Text style={[t.caption, { color: c.textSecondary }]}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  centerText: { textAlign: 'center' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 오른쪽 화살표를 뒤집어 뒤로 가기로 쓴다 — 아이콘을 하나 더 그리지 않아도 된다.
  flip: { transform: [{ scaleX: -1 }] },
  headText: { flex: 1, gap: 1 },
});
