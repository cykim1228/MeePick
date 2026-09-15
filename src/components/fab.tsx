import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Radius, Shadow, Spacing, TouchTarget } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/**
 * 화면 오른쪽 아래에 떠 있는 버튼.
 *
 * 목록 위에 겹쳐 두는 이유: 글쓰기·일정 추가처럼 "이 화면에서 하는 한 가지 행동"은
 * 스크롤을 얼마나 내렸든 같은 자리에 있어야 한다. 머리말에 두면 목록을 내리는 순간
 * 사라져서, 쓰려면 맨 위까지 되돌아가야 한다.
 *
 * 엄지가 닿는 자리이기도 하다 — 폰을 한 손으로 쥐면 오른쪽 아래가 가장 가깝다.
 */
export function Fab({
  icon,
  label,
  accessibilityLabel,
  onPress,
  tone = 'accent',
  slot = 0,
}: {
  icon: IconName;
  /** 붙이면 알약 모양으로 늘어난다. 아이콘만으로 뜻이 분명하지 않을 때 쓴다. */
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  /** neutral은 배경과 같은 톤 — 화면의 주된 행동이 아닐 때 */
  tone?: 'accent' | 'neutral';
  /** 한 화면에 둘 이상일 때의 자리. 0이 맨 아래, 1이 그 위. */
  slot?: number;
}) {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  // 폰에서는 화면이 좁아 떠 있는 버튼이 목록을 그만큼 가린다. 한 단계 낮춘다.
  const size = useBreakpoint() === 'compact' ? SIZE_COMPACT : SIZE;

  const accent = tone === 'accent';
  const fg = accent ? c.onAccent : c.text;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.fab,
        Shadow.card,
        label ? styles.pill : null,
        {
          height: size,
          width: label ? undefined : size,
          backgroundColor: accent ? c.accent : c.backgroundElement,
          borderColor: accent ? c.accent : c.border,
          bottom: insets.bottom + Spacing.four + slot * (size + Spacing.two),
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Icon name={icon} size={16} color={fg} />
      {label && (
        <Text style={[t.caption, styles.label, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * 버튼 높이. 손가락이 닿는 최소 크기(44)에 맞춘다 —
 * 그보다 키우면 목록 위에 얹힌 덩어리가 커져 정작 내용을 가린다.
 */
const SIZE = TouchTarget.min;
/** 폰에서의 크기. 라벨이 붙은 알약이라 아이콘만 있는 버튼보다 조금 작아도 누르기 쉽다. */
const SIZE_COMPACT = 38;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  pill: { gap: Spacing.one, paddingHorizontal: Spacing.three },
  label: { fontWeight: '700' },
});
