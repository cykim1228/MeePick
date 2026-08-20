import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/* ── 공식 룰 데이터 ─────────────────────────────────────────────────────────
 * 역할 카드 수·시작 손패·금괴 분배는 사보타지(Saboteur) 기본판 공식 룰.
 * 역할 카드는 항상 인원+1장을 섞어 1장을 비공개로 빼므로,
 * 실제 방해꾼 수는 표의 최대치보다 적을 수 있다 — 그게 이 게임의 긴장감이다.
 */
type SaboteurSetup = {
  /** 금꾼 역할 카드 수 */
  gold: number;
  /** 방해꾼 역할 카드 수 */
  sabo: number;
  /** 시작 손패 */
  hand: number;
};

const SETUPS: Record<number, SaboteurSetup> = {
  3: { gold: 3, sabo: 1, hand: 6 },
  4: { gold: 4, sabo: 1, hand: 6 },
  5: { gold: 4, sabo: 2, hand: 6 },
  6: { gold: 5, sabo: 2, hand: 5 },
  7: { gold: 5, sabo: 3, hand: 5 },
  8: { gold: 6, sabo: 3, hand: 4 },
  9: { gold: 7, sabo: 3, hand: 4 },
  10: { gold: 7, sabo: 4, hand: 4 },
};

const COUNTS = [3, 4, 5, 6, 7, 8, 9, 10];

type Props = {
  visible: boolean;
  /** 오늘 판의 인원 — 범위(3~10) 안이면 자동 선택된다 */
  playerCount: number;
  onClose: () => void;
};

/**
 * 사보타지 인원별 구성표 — 역할 카드 비율·시작 손패·금괴 분배를 한 화면에.
 * 참조 도구라 선 뽑기·타이머처럼 가운데 팝업으로 띄운다 (기록형만 전체 화면).
 */
export function SaboteurSheet({ visible, playerCount, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(() =>
    COUNTS.includes(playerCount) ? playerCount : 3
  );
  const setup = SETUPS[count];

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
              <Text style={[styles.caption, { color: c.accent }]}>사보타지</Text>
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

            {/* 역할 카드 구성 */}
            <View style={styles.sideRow}>
              <View style={[styles.sideCard, { backgroundColor: c.backgroundElement, borderColor: c.badgeBest }]}>
                <Text style={[styles.sideCount, { color: c.badgeBest }]}>{setup.gold}</Text>
                <Text style={[styles.body, { color: c.text }]}>⛏️ 금꾼</Text>
              </View>
              <View style={[styles.sideCard, { backgroundColor: c.backgroundElement, borderColor: c.danger }]}>
                <Text style={[styles.sideCount, { color: c.danger }]}>{setup.sabo}</Text>
                <Text style={[styles.body, { color: c.text }]}>💣 방해꾼</Text>
              </View>
            </View>
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              역할 카드 {setup.gold + setup.sabo}장(인원+1)을 섞어 1장은 비공개로 빼두세요.
              실제 방해꾼은 최대 {setup.sabo}명 — 몇 명인지는 아무도 몰라요.
            </Text>

            {/* 시작 손패 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>시작 손패</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.body, { color: c.text }]}>
                각자 <Text style={{ color: c.accent }}>{setup.hand}장</Text>씩 받고 시작 —
                자기 차례에 1장 내고(또는 버리고) 1장 뽑아요.
              </Text>
            </View>

            {/* 금괴 분배 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>라운드 끝 — 금괴 분배</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <View style={styles.payoutLine}>
                <Text style={[styles.payoutSide, { color: c.badgeBest }]}>금꾼 승</Text>
                <Text style={[styles.body, { color: c.text, flex: 1 }]}>
                  금 카드 {Math.min(count, 9)}장(인원수, 최대 9장)을 뽑아 금에 도달한 사람부터
                  시계 반대 방향으로 금꾼만 1장씩 가져가요.
                </Text>
              </View>
              <View style={styles.payoutLine}>
                <Text style={[styles.payoutSide, { color: c.danger }]}>방해꾼 승</Text>
                <Text style={[styles.body, { color: c.text, flex: 1 }]}>
                  1명이면 금 4개, 2~3명이면 각 3개, 4명이면 각 2개씩 받아요.
                </Text>
              </View>
            </View>

            {/* 진행 리마인더 */}
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                총 3라운드 — 끝났을 때 금괴가 가장 많은 사람이 최종 우승!
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
  sideRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.three },
  sideCard: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 2,
  },
  sideCount: { fontSize: 44, lineHeight: 56, fontFamily: 'Jua_400Regular' },
  infoCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  payoutLine: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  payoutSide: { ...Typography.subtitle, width: 76 },
});
