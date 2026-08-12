import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 데이터 화면은 로딩·빈 결과·에러를 전부 구현한다.
 * 정상 케이스만 만들면 실제 사용 첫날에 나머지가 그대로 드러난다.
 */

export function LoadingView({ label = '불러오는 중' }: { label?: string }) {
  const c = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={c.accent} />
      <Text style={[styles.caption, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: c.danger }]}>불러오지 못했습니다</Text>
      <Text style={[styles.body, { color: c.textSecondary }]}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: c.accent }]}>
          <Text style={[styles.body, { color: c.onAccent }]}>다시 시도</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyView({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      {hint && <Text style={[styles.body, { color: c.textSecondary }]}>{hint}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  title: { ...Typography.title, textAlign: 'center' },
  body: { ...Typography.body, textAlign: 'center' },
  caption: { ...Typography.caption },
  button: {
    minHeight: TouchTarget.primary,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
  },
});
