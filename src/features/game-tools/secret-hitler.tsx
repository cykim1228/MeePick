import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/* ── 공식 룰 데이터 (시크릿 히틀러) ─────────────────────────────────────────
 * 진영 비율과 대통령 권한 트랙은 인원 구간(5-6 / 7-8 / 9-10)별로 다르다.
 * 5~6인은 히틀러가 파시스트를 알고, 7인부터는 모른다 — 가장 자주 틀리는 부분.
 */
type ShSetup = {
  liberal: number;
  fascist: number;
  /** 히틀러가 파시스트를 아는가 */
  hitlerKnows: boolean;
  /** 파시스트 정책 1~5번째 제정 시 대통령 권한 (null = 없음) */
  powers: [string | null, string | null, string | null, string | null, string | null];
};

const POWERS_56: ShSetup['powers'] = [null, null, '정책 3장 엿보기', '처형', '처형 (거부권 해금)'];
const POWERS_78: ShSetup['powers'] = [null, '소속 조사', '특별 선거', '처형', '처형 (거부권 해금)'];
const POWERS_910: ShSetup['powers'] = ['소속 조사', '소속 조사', '특별 선거', '처형', '처형 (거부권 해금)'];

const SETUPS: Record<number, ShSetup> = {
  5: { liberal: 3, fascist: 1, hitlerKnows: true, powers: POWERS_56 },
  6: { liberal: 4, fascist: 1, hitlerKnows: true, powers: POWERS_56 },
  7: { liberal: 4, fascist: 2, hitlerKnows: false, powers: POWERS_78 },
  8: { liberal: 5, fascist: 2, hitlerKnows: false, powers: POWERS_78 },
  9: { liberal: 5, fascist: 3, hitlerKnows: false, powers: POWERS_910 },
  10: { liberal: 6, fascist: 3, hitlerKnows: false, powers: POWERS_910 },
};

const COUNTS = [5, 6, 7, 8, 9, 10];

type Props = {
  visible: boolean;
  /** 오늘 판의 인원 — 범위(5~10) 안이면 자동 선택된다 */
  playerCount: number;
  onClose: () => void;
};

/**
 * 시크릿 히틀러 인원별 구성표 — 진영 비율·밤 단계·대통령 권한 트랙을 한 화면에.
 * 참조 도구라 선 뽑기·타이머처럼 가운데 팝업으로 띄운다 (기록형만 전체 화면).
 */
export function SecretHitlerSheet({ visible, playerCount, onClose }: Props) {
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
              <Text style={[styles.caption, { color: c.accent }]}>시크릿 히틀러</Text>
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
              <View style={[styles.sideCard, { backgroundColor: c.backgroundElement, borderColor: c.badgeRecommended }]}>
                <Text style={[styles.sideCount, { color: c.badgeRecommended }]}>{setup.liberal}</Text>
                <Text style={[styles.body, { color: c.text }]}>🕊️ 자유주의자</Text>
              </View>
              <View style={[styles.sideCard, { backgroundColor: c.backgroundElement, borderColor: c.danger }]}>
                <Text style={[styles.sideCount, { color: c.danger }]}>{setup.fascist}+1</Text>
                <Text style={[styles.body, { color: c.text }]}>🦎 파시스트 + 히틀러</Text>
              </View>
            </View>

            {/* 밤 단계 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>밤 단계</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              {setup.hitlerKnows ? (
                <Text style={[styles.body, { color: c.text }]}>
                  파시스트와 <Text style={{ color: c.danger }}>히틀러가 서로 확인</Text>합니다.
                </Text>
              ) : (
                <Text style={[styles.body, { color: c.text }]}>
                  파시스트만 눈을 뜨고 서로·히틀러를 확인 —{' '}
                  <Text style={{ color: c.danger }}>히틀러는 눈을 감은 채 엄지만</Text> 듭니다.
                </Text>
              )}
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                {setup.hitlerKnows
                  ? '5~6인에서만 히틀러가 파시스트를 알아요.'
                  : '7인부터는 히틀러가 파시스트를 몰라요 — 가장 자주 틀리는 규칙!'}
              </Text>
            </View>

            {/* 대통령 권한 트랙 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
              파시스트 정책 제정 시 대통령 권한
            </Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              {setup.powers.map((power, i) => (
                <View key={i} style={styles.powerLine}>
                  <Text style={[styles.powerIndex, { color: power ? c.danger : c.textSecondary }]}>
                    {i + 1}번째
                  </Text>
                  <Text style={[styles.body, { color: power ? c.text : c.textSecondary, flex: 1 }]}>
                    {power ?? '없음'}
                  </Text>
                </View>
              ))}
            </View>

            {/* 승리 조건 */}
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>승리 조건</Text>
            <View style={[styles.infoCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ color: c.badgeRecommended }}>자유</Text> — 자유 정책 5장 또는 히틀러 처형
              </Text>
              <Text style={[styles.body, { color: c.text }]}>
                <Text style={{ color: c.danger }}>파시스트</Text> — 파시스트 정책 6장, 또는 정책 3장
                이후 히틀러가 총리로 선출
              </Text>
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                파시스트 정책 3장부터는 총리 후보가 히틀러인지 반드시 의심하세요.
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
  powerLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  powerIndex: { ...Typography.caption, width: 52, fontWeight: '700' },
});
