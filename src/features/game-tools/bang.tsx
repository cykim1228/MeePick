import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/* ── 공식 룰 데이터 (뱅! 기본판) ────────────────────────────────────────────
 * 역할 배분은 인원별로 고정이다. 보안관만 공개하고 나머지는 비밀.
 */
type BangSetup = {
  sheriff: 1;
  deputy: number;
  outlaw: number;
  renegade: 1;
};

const SETUPS: Record<number, BangSetup> = {
  4: { sheriff: 1, deputy: 0, outlaw: 2, renegade: 1 },
  5: { sheriff: 1, deputy: 1, outlaw: 2, renegade: 1 },
  6: { sheriff: 1, deputy: 1, outlaw: 3, renegade: 1 },
  7: { sheriff: 1, deputy: 2, outlaw: 3, renegade: 1 },
};

const COUNTS = [4, 5, 6, 7];

type Props = {
  visible: boolean;
  /** 오늘 판의 인원 — 범위(4~7) 안이면 자동 선택된다 */
  playerCount: number;
  onClose: () => void;
};

/**
 * 뱅! 인원별 구성표 — 역할 배분과 승리 조건을 한 화면에.
 * 참조 도구라 선 뽑기·타이머처럼 가운데 팝업으로 띄운다 (기록형만 전체 화면).
 */
export function BangSheet({ visible, playerCount, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(() =>
    COUNTS.includes(playerCount) ? playerCount : 4
  );
  const setup = SETUPS[count];

  const roles = [
    { emoji: '⭐', name: '보안관', n: setup.sheriff, color: c.accent, note: '유일하게 공개 — 체력 +1, 첫 턴 시작' },
    { emoji: '🎖️', name: '부관', n: setup.deputy, color: c.badgeBest, note: '보안관을 지킨다' },
    { emoji: '🔫', name: '무법자', n: setup.outlaw, color: c.danger, note: '보안관을 노린다' },
    { emoji: '🐍', name: '배신자', n: setup.renegade, color: c.badgeRecommended, note: '최후의 1인을 노린다' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { paddingTop: insets.top + Spacing.four }]}
        onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.accent }]}
          onPress={() => undefined}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.caption, { color: c.accent }]}>뱅!</Text>
              <Text style={[styles.title, { color: c.text }]}>{count}인 구성</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
              <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.chipRow}>
              {COUNTS.map((n) => (
                <Chip
                  key={n}
                  label={`${n}인${n === playerCount ? ' (오늘)' : ''}`}
                  selected={count === n}
                  onPress={() => setCount(n)}
                />
              ))}
            </View>

            {/* 역할 배분 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>역할 배분</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              {roles.map((r) => (
                <View key={r.name} style={styles.roleLine}>
                  <Text style={[styles.roleCount, { color: r.n === 0 ? c.textSecondary : r.color }]}>
                    {r.emoji} {r.n}
                  </Text>
                  <Text style={[styles.body, { color: r.n === 0 ? c.textSecondary : c.text }]}>{r.name}</Text>
                  <Text style={[styles.caption, { color: c.textSecondary, flex: 1 }]} numberOfLines={2}>
                    {r.n === 0 ? '이 인원에선 없음' : r.note}
                  </Text>
                </View>
              ))}
            </View>

            {/* 승리 조건 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>승리 조건</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ color: c.accent }}>보안관·부관</Text> — 무법자와 배신자를 모두 제거
              </Text>
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ color: c.danger }}>무법자</Text> — 보안관을 제거
              </Text>
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ color: c.badgeRecommended }}>배신자</Text> — 마지막까지 살아남아 1:1로 보안관을 제거
              </Text>
            </View>

            {/* 진행 리마인더 */}
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                무법자를 제거하면 카드 3장 보상, 보안관이 부관을 제거하면 자기 카드를 전부 버려요.
                거리(자리 간격)를 잊지 마세요!
              </Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: Spacing.four,
  },
  card: {
    width: '96%',
    maxWidth: 560,
    maxHeight: '92%',
    borderRadius: Radius.lg,
    borderWidth: 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...Typography.title },
  body: { ...Typography.body },
  caption: { ...Typography.caption },
  close: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sectionLabel: { ...Typography.label, marginTop: Spacing.three },
  infoCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  roleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  roleCount: { ...Typography.subtitle, width: 56 },
});
