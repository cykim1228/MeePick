import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/* ── 공식 룰 데이터 (한밤의 늑대인간 기본판) ────────────────────────────────
 * 카드는 항상 인원+3장 — 3장은 가운데에 엎어 둔다.
 * 룰북 권장 첫 조합: 늑대인간 2 + 선견자 + 강도 + 말썽꾸러기 + 주민으로 채우기.
 * 밤에 깨우는 순서는 역할별로 고정이며, 없는 역할은 건너뛴다.
 */
const COUNTS = [3, 4, 5, 6, 7, 8, 9, 10];

/** 밤 단계 순서 (기본판 전체) — 조합에 넣은 역할만 순서대로 부른다 */
const NIGHT_ORDER: { name: string; action: string }[] = [
  { name: '도플갱어', action: '다른 사람 카드를 보고 그 역할이 된다' },
  { name: '늑대인간', action: '서로 확인 (혼자면 가운데 1장 보기)' },
  { name: '하수인', action: '늑대인간이 누군지 확인' },
  { name: '프리메이슨', action: '서로 확인' },
  { name: '선견자', action: '한 사람 카드 또는 가운데 2장 보기' },
  { name: '강도', action: '다른 사람과 카드 교환 후 새 카드 확인' },
  { name: '말썽꾸러기', action: '다른 두 사람의 카드를 맞바꾼다' },
  { name: '주정뱅이', action: '가운데 카드와 교환 (확인 불가)' },
  { name: '불면증 환자', action: '자기 카드를 다시 확인' },
];

/** 룰북 권장 첫 조합에 포함되는 역할 */
const BASIC_ROLES = new Set(['늑대인간', '선견자', '강도', '말썽꾸러기']);

type Props = {
  visible: boolean;
  /** 오늘 판의 인원 — 범위(3~10) 안이면 자동 선택된다 */
  playerCount: number;
  onClose: () => void;
};

/**
 * 한밤의 늑대인간 인원별 구성표 — 카드 수·권장 조합·밤 단계 순서를 한 화면에.
 * 참조 도구라 선 뽑기·타이머처럼 가운데 팝업으로 띄운다 (기록형만 전체 화면).
 */
export function OneNightSheet({ visible, playerCount, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(() =>
    COUNTS.includes(playerCount) ? playerCount : 3
  );
  const villagers = count - 2; // 고정 4장(늑대2·선견자·강도·말썽꾸러기)을 뺀 나머지

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
              <Text style={[styles.caption, { color: c.accent }]}>한밤의 늑대인간</Text>
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

            {/* 카드 구성 */}
            <View style={styles.sideRow}>
              <View style={[styles.sideCard, { backgroundColor: c.backgroundElement, borderColor: c.accent }]}>
                <Text style={[styles.sideCount, { color: c.accent }]}>{count + 3}</Text>
                <Text style={[styles.body, { color: c.text }]}>🃏 카드 (인원+3)</Text>
              </View>
              <View style={[styles.sideCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                <Text style={[styles.sideCount, { color: c.textSecondary }]}>3</Text>
                <Text style={[styles.body, { color: c.text }]}>🌙 가운데 더미</Text>
              </View>
            </View>

            {/* 권장 조합 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>권장 조합 (룰북 기준)</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.body, { color: c.text }]}>
                🐺 늑대인간 2 · 🔮 선견자 · 🤏 강도 · 🔀 말썽꾸러기 +{' '}
                <Text style={{ color: c.accent }}>주민 {villagers}장</Text>
              </Text>
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                익숙해지면 주민 대신 하수인·주정뱅이·불면증 환자·무두장이를 섞어 보세요.
                무두장이는 "내가 처형되면 단독 승리"라 분위기가 완전히 달라져요.
              </Text>
            </View>

            {/* 밤 단계 순서 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>밤 단계 순서</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              {NIGHT_ORDER.map((role, i) => (
                <View key={role.name} style={styles.orderLine}>
                  <Text style={[styles.orderIndex, { color: c.textSecondary }]}>{i + 1}</Text>
                  <Text
                    style={[
                      styles.body,
                      { color: BASIC_ROLES.has(role.name) ? c.text : c.textSecondary, width: 92 },
                    ]}>
                    {role.name}
                  </Text>
                  <Text style={[styles.caption, { color: c.textSecondary, flex: 1 }]} numberOfLines={2}>
                    {role.action}
                  </Text>
                </View>
              ))}
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                조합에 넣은 역할만 순서대로 부르세요. 진한 글씨가 권장 조합의 역할입니다.
              </Text>
            </View>

            {/* 승리 조건 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>아침 — 동시 지목 후</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ color: c.badgeBest }}>마을</Text> — 늑대인간을 한 명이라도 처형하면 승리
              </Text>
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ color: c.danger }}>늑대인간</Text> — 늑대가 아무도 안 죽으면 승리
              </Text>
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                밤 사이 카드가 바뀌었을 수 있어요 — 지금 내 카드가 진짜 내 역할! 최다 득표가
                동수면 모두 처형돼요.
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
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  orderIndex: { ...Typography.caption, width: 20, fontWeight: '700' },
});
