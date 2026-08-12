import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  selected?: boolean;
  /** 이 칩을 눌렀을 때 남는 결과 수. 0건이 될 칩을 누르기 전에 알 수 있어야 한다. */
  count?: number;
  disabled?: boolean;
  onPress: () => void;
};

export function Chip({ label, selected = false, count, disabled = false, onPress }: Props) {
  const c = useTheme();
  const dimmed = disabled || count === 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={dimmed}
      accessibilityRole="button"
      // 라벨과 개수가 별도 Text로 나뉘어 있어 이름이 "파티43"처럼 붙어 읽힌다.
      accessibilityLabel={count === undefined ? label : `${label}, ${count}개`}
      accessibilityState={{ selected, disabled: dimmed }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.accent : c.backgroundElement,
          borderColor: selected ? c.accent : c.border,
          opacity: dimmed ? 0.4 : pressed ? 0.75 : 1,
        },
      ]}>
      <Text style={[styles.label, { color: selected ? c.onAccent : c.text }]}>{label}</Text>
      {count !== undefined && (
        <View style={[styles.count, { backgroundColor: selected ? c.onAccent : c.background }]}>
          <Text style={[styles.countText, { color: selected ? c.accent : c.textSecondary }]}>
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: TouchTarget.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  label: { ...Typography.body, fontWeight: '600' },
  count: {
    minWidth: 26,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  countText: { ...Typography.caption },
});

/** 화면 상단 등에서 쓰는 설명 배지. 누를 수 없다. */
export function Badge({ label, color }: { label: string; color: string }) {
  const c = useTheme();
  return (
    <View style={[badgeStyles.badge, { borderColor: color, backgroundColor: c.background }]}>
      <Text style={[badgeStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  text: { ...Typography.caption },
});
