import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';

/* ── 점수 규칙 (해녀 정식 룰) ───────────────────────────────────────────────
 * 8라운드 동안 물질로 해산물(미역·성게·전복·진주)과 쓰레기를 모으고,
 * 3·6·8라운드 끝에 세 번 정산한다. 정산마다 얻은 점수를 적어 누적하면 된다.
 */
const PHASES = [
  { chip: '3R', label: '1차 정산 (3라운드)' },
  { chip: '6R', label: '2차 정산 (6라운드)' },
  { chip: '8R', label: '최종 정산 (8라운드)' },
];

export type HaenyeoDraft = {
  current: number;
  /** 정산(0-based) → memberId → 그 정산에서 얻은 점수 문자열 */
  entries: Record<string, string>[];
};

/** 스토어의 unknown 초안을 안전하게 복원한다. 모양이 어긋나면 새로 시작한다. */
export function coerceHaenyeoDraft(v: unknown): HaenyeoDraft {
  const fresh: HaenyeoDraft = {
    current: 0,
    entries: Array.from({ length: PHASES.length }, () => ({})),
  };
  if (typeof v !== 'object' || v === null) return fresh;
  const o = v as Partial<HaenyeoDraft>;
  if (!Array.isArray(o.entries) || o.entries.length !== PHASES.length) return fresh;
  return {
    current:
      typeof o.current === 'number' && o.current >= 0 && o.current < PHASES.length ? o.current : 0,
    entries: o.entries.map((e) =>
      typeof e === 'object' && e !== null ? (e as Record<string, string>) : {}
    ),
  };
}

const num = (t: string | undefined): number | null => {
  if (!t || t.trim() === '') return null;
  const n = parseInt(t.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function haenyeoTotals(draft: HaenyeoDraft, players: Member[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of players) {
    let sum = 0;
    let any = false;
    for (const phaseEntries of draft.entries) {
      const s = num(phaseEntries[p.id]);
      if (s !== null) {
        sum += s;
        any = true;
      }
    }
    if (any) totals[p.id] = sum;
  }
  return totals;
}

type Props = {
  visible: boolean;
  players: Member[];
  draft: unknown;
  onDraftChange: (draft: HaenyeoDraft) => void;
  /** 합계를 플레이 기록의 라운드로 저장. 성공 시 true */
  onCommit: (totals: Record<string, number>, winnerIds: string[]) => Promise<boolean>;
  pending: boolean;
  onClose: () => void;
};

/**
 * 해녀 정산표 — 3·6·8라운드 세 번의 정산 점수를 적으면 누적을 자동 계산한다.
 * 초안은 스토어(plays store의 toolDraft)에 있어 시트를 닫아도 유지된다.
 */
export function HaenyeoSheet({ visible, players, draft: rawDraft, onDraftChange, onCommit, pending, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useMemo(() => coerceHaenyeoDraft(rawDraft), [rawDraft]);

  const totals = useMemo(() => haenyeoTotals(draft, players), [draft, players]);
  const ranked = useMemo(
    () => players.filter((p) => totals[p.id] !== undefined).sort((a, b) => totals[b.id] - totals[a.id]),
    [players, totals]
  );
  const topScore = ranked.length ? totals[ranked[0].id] : null;

  const setEntry = (memberId: string, value: string) => {
    const entries = draft.entries.map((phaseEntries, i) =>
      i === draft.current ? { ...phaseEntries, [memberId]: value } : phaseEntries
    );
    onDraftChange({ ...draft, entries });
  };

  const commit = async () => {
    if (topScore === null) return;
    const winnerIds = ranked.filter((p) => totals[p.id] === topScore).map((p) => p.id);
    const ok = await onCommit(totals, winnerIds);
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={styles.headerText}>
            <Text style={[styles.caption, { color: c.accent }]}>해녀 정산표</Text>
            <Text style={[styles.title, { color: c.text }]}>{PHASES[draft.current].label}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* 정산 선택 — 지나간 정산 수정도 가능 */}
          <View style={styles.chipRow}>
            {PHASES.map((phase, i) => {
              const done = players.some((p) => num(draft.entries[i][p.id]) !== null);
              return (
                <Chip
                  key={phase.chip}
                  label={`${phase.chip}${done ? ' ✓' : ''}`}
                  selected={draft.current === i}
                  onPress={() => onDraftChange({ ...draft, current: i })}
                />
              );
            })}
          </View>

          <Text style={[styles.caption, { color: c.textSecondary }]}>
            정산 때 얻은 점수(해산물·진주·쓰레기 합)를 적으세요.
          </Text>

          {players.map((p) => (
            <View key={p.id} style={styles.inputRow}>
              <Text style={[styles.body, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {p.name}
              </Text>
              <TextInput
                value={draft.entries[draft.current][p.id] ?? ''}
                onChangeText={(v) => setEntry(p.id, v)}
                placeholder="0"
                placeholderTextColor={c.textSecondary}
                keyboardType="number-pad"
                style={[
                  styles.scoreInput,
                  { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}
              />
              <Text style={[styles.body, { color: c.textSecondary }]}>점</Text>
            </View>
          ))}

          {/* 누적 현황 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>누적</Text>
          {ranked.length === 0 && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              점수를 입력하면 자동으로 합산됩니다.
            </Text>
          )}
          {ranked.map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.totalRow,
                { backgroundColor: c.backgroundElement, borderColor: i === 0 ? c.accent : c.border },
              ]}>
              <Text style={[styles.body, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {i === 0 ? '👑 ' : ''}
                {p.name}
              </Text>
              <Text style={[styles.totalScore, { color: i === 0 ? c.accent : c.text }]}>
                {totals[p.id]}점
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + Spacing.three }]}>
          <Pressable
            onPress={() => void commit()}
            disabled={pending || topScore === null}
            accessibilityRole="button"
            style={[
              styles.commitButton,
              { backgroundColor: c.accent, opacity: pending || topScore === null ? 0.4 : 1 },
            ]}>
            <Text style={[styles.commitText, { color: c.onAccent }]}>
              {pending ? '저장 중…' : '합계를 플레이 기록에 저장'}
            </Text>
          </Pressable>
          <Text style={[styles.caption, { color: c.textSecondary, textAlign: 'center' }]}>
            1위가 우승자로, 합계가 개인 점수로 기록됩니다. 저장 전까지는 자유롭게 수정하세요.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...Typography.title },
  body: { ...Typography.body },
  caption: { ...Typography.caption },
  close: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.two, maxWidth: 720, width: '100%', alignSelf: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  sectionLabel: { ...Typography.label, marginTop: Spacing.three },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  scoreInput: {
    width: 150,
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    textAlign: 'right',
    fontSize: 22,
    lineHeight: 28,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  totalScore: { ...Typography.subtitle },
  footer: { padding: Spacing.four, gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  commitButton: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  commitText: { ...Typography.body, fontWeight: '700' },
});
