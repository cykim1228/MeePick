import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';

/* ── 점수 규칙 (스컬킹 정식 룰) ─────────────────────────────────────────────
 * 라운드 r에서:
 * - 비드 0 성공(트릭 0):  +10 × r        (제로비드는 트릭을 못 따니 보너스 없음)
 * - 비드 0 실패(트릭 >0): −10 × r
 * - 비드 적중:            +20 × 비드 + 보너스
 * - 비드 실패:            −10 × |비드 − 트릭|  (보너스 무효)
 */
export function skullKingRoundScore(round: number, bid: number, trick: number, bonus: number): number {
  if (bid === 0) return trick === 0 ? 10 * round : -10 * round;
  if (bid === trick) return 20 * bid + bonus;
  return -10 * Math.abs(bid - trick);
}

const ROUNDS = 10;

type Entry = { bid: string; trick: string; bonus: string };

export type SkullKingDraft = {
  current: number;
  /** 라운드(0-based) → memberId → 입력값 */
  entries: Record<string, Entry>[];
};

/** 스토어의 unknown 초안을 안전하게 복원한다. 모양이 어긋나면 새로 시작한다. */
export function coerceSkullKingDraft(v: unknown): SkullKingDraft {
  const fresh: SkullKingDraft = { current: 0, entries: Array.from({ length: ROUNDS }, () => ({})) };
  if (typeof v !== 'object' || v === null) return fresh;
  const o = v as Partial<SkullKingDraft>;
  if (!Array.isArray(o.entries) || o.entries.length !== ROUNDS) return fresh;
  return {
    current: typeof o.current === 'number' && o.current >= 0 && o.current < ROUNDS ? o.current : 0,
    entries: o.entries.map((e) => (typeof e === 'object' && e !== null ? (e as Record<string, Entry>) : {})),
  };
}

const num = (t: string | undefined): number | null => {
  if (!t || t.trim() === '') return null;
  const n = parseInt(t.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** 라운드 입력이 완성됐을 때만 점수를 낸다 (비드·트릭 둘 다 필요, 보너스는 선택). */
function entryScore(roundIndex: number, entry: Entry | undefined): number | null {
  if (!entry) return null;
  const bid = num(entry.bid);
  const trick = num(entry.trick);
  if (bid === null || trick === null) return null;
  return skullKingRoundScore(roundIndex + 1, bid, trick, num(entry.bonus) ?? 0);
}

export function skullKingTotals(draft: SkullKingDraft, players: Member[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of players) {
    let sum = 0;
    let any = false;
    draft.entries.forEach((roundEntries, i) => {
      const s = entryScore(i, roundEntries[p.id]);
      if (s !== null) {
        sum += s;
        any = true;
      }
    });
    if (any) totals[p.id] = sum;
  }
  return totals;
}

type Props = {
  visible: boolean;
  players: Member[];
  draft: unknown;
  onDraftChange: (draft: SkullKingDraft) => void;
  /** 합계를 플레이 기록의 라운드로 저장. 성공 시 true */
  onCommit: (totals: Record<string, number>, winnerIds: string[]) => Promise<boolean>;
  pending: boolean;
  onClose: () => void;
};

/**
 * 스컬킹 점수표 — 라운드별 비드/트릭/보너스만 넣으면 점수·누적을 자동 계산한다.
 * 초안은 스토어(plays store의 toolDraft)에 있어 시트를 닫거나 다른 화면에서 열어도 유지된다.
 */
export function SkullKingSheet({ visible, players, draft: rawDraft, onDraftChange, onCommit, pending, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useMemo(() => coerceSkullKingDraft(rawDraft), [rawDraft]);

  const totals = useMemo(() => skullKingTotals(draft, players), [draft, players]);
  const ranked = useMemo(
    () => players.filter((p) => totals[p.id] !== undefined).sort((a, b) => totals[b.id] - totals[a.id]),
    [players, totals]
  );
  const topScore = ranked.length ? totals[ranked[0].id] : null;

  const setEntry = (memberId: string, patch: Partial<Entry>) => {
    const entries = draft.entries.map((roundEntries, i) => {
      if (i !== draft.current) return roundEntries;
      const prev = roundEntries[memberId] ?? { bid: '', trick: '', bonus: '' };
      return { ...roundEntries, [memberId]: { ...prev, ...patch } };
    });
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
            <Text style={[styles.caption, { color: c.accent }]}>스컬킹 점수표</Text>
            <Text style={[styles.title, { color: c.text }]}>{draft.current + 1}라운드</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* 라운드 선택 — 지나간 라운드 수정도 가능 */}
          <View style={styles.chipRow}>
            {Array.from({ length: ROUNDS }, (_, i) => {
              const done = players.some((p) => entryScore(i, draft.entries[i][p.id]) !== null);
              return (
                <Chip
                  key={i}
                  label={`${i + 1}R${done ? ' ✓' : ''}`}
                  selected={draft.current === i}
                  onPress={() => onDraftChange({ ...draft, current: i })}
                />
              );
            })}
          </View>

          {/* 현재 라운드 입력 */}
          <View style={styles.inputHead}>
            <Text style={[styles.inputHeadName, styles.caption, { color: c.textSecondary }]}> </Text>
            <Text style={[styles.inputCol, styles.caption, { color: c.textSecondary }]}>비드</Text>
            <Text style={[styles.inputCol, styles.caption, { color: c.textSecondary }]}>트릭</Text>
            <Text style={[styles.inputCol, styles.caption, { color: c.textSecondary }]}>보너스</Text>
            <Text style={[styles.inputScore, styles.caption, { color: c.textSecondary }]}>점수</Text>
          </View>
          {players.map((p) => {
            const entry = draft.entries[draft.current][p.id] ?? { bid: '', trick: '', bonus: '' };
            const score = entryScore(draft.current, entry);
            return (
              <View key={p.id} style={styles.inputRow}>
                <Text style={[styles.inputHeadName, styles.body, { color: c.text }]} numberOfLines={1}>
                  {p.name}
                </Text>
                {(['bid', 'trick', 'bonus'] as const).map((field) => (
                  <TextInput
                    key={field}
                    value={entry[field]}
                    onChangeText={(v) => setEntry(p.id, { [field]: v })}
                    placeholder={field === 'bonus' ? '0' : '-'}
                    placeholderTextColor={c.textSecondary}
                    keyboardType="number-pad"
                    style={[
                      styles.numInput,
                      { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
                    ]}
                  />
                ))}
                <Text
                  style={[
                    styles.inputScore,
                    styles.body,
                    { color: score === null ? c.textSecondary : score >= 0 ? c.badgeBest : c.danger },
                  ]}>
                  {score === null ? '·' : score > 0 ? `+${score}` : `${score}`}
                </Text>
              </View>
            );
          })}

          {/* 누적 현황 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>누적</Text>
          {ranked.length === 0 && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              비드와 트릭을 입력하면 자동으로 계산됩니다.
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
  inputHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inputHeadName: { flex: 1 },
  inputCol: { width: 76, textAlign: 'center' },
  inputScore: { width: 64, textAlign: 'right' },
  numInput: {
    width: 76,
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 26,
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
