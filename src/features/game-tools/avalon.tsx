import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/* ── 공식 룰 데이터 ─────────────────────────────────────────────────────────
 * 진영 비율·퀘스트 파견 인원은 레지스탕스: 아발론 공식 룰.
 * 역할 조합은 가장 널리 쓰이는 밸런스 권장안 — 멀린·암살자는 항상 포함이 기본이다.
 */
type AvalonSetup = {
  good: number;
  evil: number;
  quests: [number, number, number, number, number];
  /** 이 퀘스트(1-base)는 실패 2장이 있어야 실패한다. 7인 이상 4퀘스트 */
  twoFailQuest: number | null;
  goodRoles: string[];
  evilRoles: string[];
};

const SETUPS: Record<number, AvalonSetup> = {
  5: {
    good: 3, evil: 2, quests: [2, 3, 2, 3, 3], twoFailQuest: null,
    goodRoles: ['멀린', '퍼시벌', '충신 1'], evilRoles: ['암살자', '모르가나'],
  },
  6: {
    good: 4, evil: 2, quests: [2, 3, 4, 3, 4], twoFailQuest: null,
    goodRoles: ['멀린', '퍼시벌', '충신 2'], evilRoles: ['암살자', '모르가나'],
  },
  7: {
    good: 4, evil: 3, quests: [2, 3, 3, 4, 4], twoFailQuest: 4,
    goodRoles: ['멀린', '퍼시벌', '충신 2'], evilRoles: ['암살자', '모르가나', '오베론'],
  },
  8: {
    good: 5, evil: 3, quests: [3, 4, 4, 5, 5], twoFailQuest: 4,
    goodRoles: ['멀린', '퍼시벌', '충신 3'], evilRoles: ['암살자', '모르가나', '미니언 1'],
  },
  9: {
    good: 6, evil: 3, quests: [3, 4, 4, 5, 5], twoFailQuest: 4,
    goodRoles: ['멀린', '퍼시벌', '충신 4'], evilRoles: ['암살자', '모르가나', '모드레드'],
  },
  10: {
    good: 6, evil: 4, quests: [3, 4, 4, 5, 5], twoFailQuest: 4,
    goodRoles: ['멀린', '퍼시벌', '충신 4'], evilRoles: ['암살자', '모르가나', '모드레드', '오베론'],
  },
};

const COUNTS = [5, 6, 7, 8, 9, 10];

type Props = {
  visible: boolean;
  /** 오늘 판의 인원 — 범위(5~10) 안이면 자동 선택된다 */
  playerCount: number;
  onClose: () => void;
};

/**
 * 아발론 인원별 구성표 — 진영 비율·권장 역할·퀘스트 파견 인원을 한 화면에.
 * 참조 도구라 선 뽑기·타이머처럼 가운데 팝업으로 띄운다 (기록형만 전체 화면).
 */
export function AvalonSheet({ visible, playerCount, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(() =>
    COUNTS.includes(playerCount) ? playerCount : 5
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
              <Text style={[styles.caption, { color: c.accent }]}>레지스탕스: 아발론</Text>
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

          {/* 진영 비율 */}
          <View style={styles.sideRow}>
            <View style={[styles.sideCard, { backgroundColor: c.backgroundElement, borderColor: c.badgeBest }]}>
              <Text style={[styles.sideCount, { color: c.badgeBest }]}>{setup.good}</Text>
              <Text style={[styles.body, { color: c.text }]}>아서의 충신 (선)</Text>
            </View>
            <View style={[styles.sideCard, { backgroundColor: c.backgroundElement, borderColor: c.danger }]}>
              <Text style={[styles.sideCount, { color: c.danger }]}>{setup.evil}</Text>
              <Text style={[styles.body, { color: c.text }]}>모드레드의 수하 (악)</Text>
            </View>
          </View>

          {/* 권장 역할 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>권장 역할 조합</Text>
          <View style={[styles.roleCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <View style={styles.roleLine}>
              <Text style={[styles.roleSide, { color: c.badgeBest }]}>선</Text>
              <Text style={[styles.body, { color: c.text, flex: 1 }]}>{setup.goodRoles.join(' · ')}</Text>
            </View>
            <View style={styles.roleLine}>
              <Text style={[styles.roleSide, { color: c.danger }]}>악</Text>
              <Text style={[styles.body, { color: c.text, flex: 1 }]}>{setup.evilRoles.join(' · ')}</Text>
            </View>
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              멀린·암살자는 기본 포함. 처음 하는 멤버가 있으면 모르가나·오베론을 빼고 시작하는 것도 좋아요.
            </Text>
          </View>

          {/* 퀘스트별 파견 인원 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>퀘스트별 파견 인원</Text>
          <View style={styles.questRow}>
            {setup.quests.map((size, i) => {
              const twoFail = setup.twoFailQuest === i + 1;
              return (
                <View
                  key={i}
                  style={[
                    styles.questCircle,
                    { backgroundColor: c.backgroundElement, borderColor: twoFail ? c.danger : c.border },
                  ]}>
                  <Text style={[styles.caption, { color: c.textSecondary }]}>{i + 1}퀘</Text>
                  <Text style={[styles.questSize, { color: c.text }]}>{size}</Text>
                  {twoFail && <Text style={[styles.twoFail, { color: c.danger }]}>실패 2장</Text>}
                </View>
              );
            })}
          </View>
          {setup.twoFailQuest !== null && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              ⚠️ {count}인 게임에서는 {setup.twoFailQuest}번 퀘스트만 실패 카드가 2장 나와야 실패합니다.
            </Text>
          )}

          {/* 진행 리마인더 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>밤 단계 순서</Text>
          <View style={[styles.roleCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={[styles.body, { color: c.text }]}>
              1. 전원 눈 감기 → 2. 악(오베론 제외) 서로 확인 → 3. 멀린이 악(모드레드 제외) 확인 →
              4. 퍼시벌이 멀린·모르가나 확인
            </Text>
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              선이 퀘스트 3번 성공하면 → 암살자가 멀린을 지목해 맞히면 악의 역전승!
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
  roleCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  roleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  roleSide: { ...Typography.subtitle, width: 28 },
  questRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  questCircle: {
    minWidth: 86,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 2,
  },
  questSize: { fontSize: 30, lineHeight: 38, fontFamily: 'Jua_400Regular' },
  twoFail: { ...Typography.caption, fontWeight: '700' },
});
