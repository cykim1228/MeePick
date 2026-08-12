import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 접이식 필터 섹션 — 테마(53종)·메커니즘(80종)처럼 옵션이 많은 축에 쓴다.
 * 기본은 접힘. 헤더(라벨+화살표)를 누르면 펼쳐진다.
 * 접혀 있어도 선택이 숨지 않도록 선택 개수를 라벨에 병기한다.
 */
export function CollapsibleFilterSection({
  label,
  selectedCount,
  expanded,
  onToggle,
  children,
}: PropsWithChildren<{
  label: string;
  selectedCount: number;
  expanded: boolean;
  onToggle: () => void;
}>) {
  const c = useTheme();
  return (
    <>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label} 필터 ${expanded ? '접기' : '펼치기'}`}
        style={styles.headerRow}>
        <Text style={[styles.label, { color: c.textSecondary }]}>
          {label}
          {selectedCount > 0 && <Text style={{ color: c.accent }}> · {selectedCount}개 선택</Text>}
        </Text>
        <Text style={[styles.chevron, { color: c.accent }]}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded && children}
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TouchTarget.min,
    marginTop: Spacing.two,
  },
  label: { ...Typography.label },
  chevron: { fontSize: 18, paddingHorizontal: Spacing.two },
});
