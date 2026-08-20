import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/* ── 공식 룰 데이터 (디셉션: 홍콩 살인사건) ─────────────────────────────────
 * 법의학자 1 + 살인마 1은 고정, 나머지는 수사관.
 * 공범·목격자는 6인 이상에서 넣는 선택 모듈 — 넣으면 수사관이 2명 줄어든다.
 */
const COUNTS = [4, 5, 6, 7, 8, 9, 10, 11, 12];

type Props = {
  visible: boolean;
  /** 오늘 판의 인원 — 범위(4~12) 안이면 자동 선택된다 */
  playerCount: number;
  onClose: () => void;
};

/**
 * 디셉션 인원별 구성표 — 역할 배분과 진행 리마인더를 한 화면에.
 * 참조 도구라 선 뽑기·타이머처럼 가운데 팝업으로 띄운다 (기록형만 전체 화면).
 */
export function DeceptionSheet({ visible, playerCount, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(() =>
    COUNTS.includes(playerCount) ? playerCount : 4
  );
  const canModule = count >= 6;

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
              <Text style={[styles.caption, { color: c.accent }]}>디셉션: 홍콩 살인사건</Text>
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
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>기본 구성</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <View style={styles.roleLine}>
                <Text style={[styles.roleCount, { color: c.badgeRecommended }]}>🔬 1</Text>
                <Text style={[styles.body, { color: c.text }]}>법의학자</Text>
                <Text style={[styles.caption, { color: c.textSecondary, flex: 1 }]} numberOfLines={2}>
                  정답을 알지만 말은 못 함 — 장면 타일로만 단서 제공
                </Text>
              </View>
              <View style={styles.roleLine}>
                <Text style={[styles.roleCount, { color: c.danger }]}>🔪 1</Text>
                <Text style={[styles.body, { color: c.text }]}>살인마</Text>
                <Text style={[styles.caption, { color: c.textSecondary, flex: 1 }]} numberOfLines={2}>
                  수단 1개 + 증거 1개를 몰래 지목
                </Text>
              </View>
              <View style={styles.roleLine}>
                <Text style={[styles.roleCount, { color: c.badgeBest }]}>🕵️ {count - 2}</Text>
                <Text style={[styles.body, { color: c.text }]}>수사관</Text>
                <Text style={[styles.caption, { color: c.textSecondary, flex: 1 }]} numberOfLines={2}>
                  배지 1개 — 단 한 번의 추리 기회
                </Text>
              </View>
            </View>

            {/* 6인+ 모듈 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
              공범·목격자 모듈 {canModule ? '(6인 이상 — 넣을 수 있어요)' : '(6인부터)'}
            </Text>
            <View
              style={[
                styles.infoCard,
                { backgroundColor: c.backgroundElement, borderColor: c.border, opacity: canModule ? 1 : 0.5 },
              ]}>
              <View style={styles.roleLine}>
                <Text style={[styles.roleCount, { color: canModule ? c.danger : c.textSecondary }]}>🤝 1</Text>
                <Text style={[styles.body, { color: c.text }]}>공범</Text>
                <Text style={[styles.caption, { color: c.textSecondary, flex: 1 }]} numberOfLines={2}>
                  살인마와 서로 알고 함께 속인다
                </Text>
              </View>
              <View style={styles.roleLine}>
                <Text style={[styles.roleCount, { color: canModule ? c.badgeBest : c.textSecondary }]}>👁️ 1</Text>
                <Text style={[styles.body, { color: c.text }]}>목격자</Text>
                <Text style={[styles.caption, { color: c.textSecondary, flex: 1 }]} numberOfLines={2}>
                  누가 범인인지 봤지만 수단은 모른다
                </Text>
              </View>
              {canModule && (
                <Text style={[styles.caption, { color: c.textSecondary }]}>
                  모듈을 넣으면 수사관이 {count - 4}명이 됩니다. 사건 해결 후 살인마 팀이
                  목격자를 맞히면 역전승!
                </Text>
              )}
            </View>

            {/* 진행 리마인더 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>진행</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.body, { color: c.text }]}>
                눈 감기 → 살인마가 수단·증거 지목 → 법의학자가 장면 타일 배치 → 토론 3라운드
              </Text>
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                수사관이 수단과 증거를 둘 다 맞히면 승리, 아무도 못 맞히면 살인마 승리.
                법의학자는 끄덕임·표정도 금지!
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
