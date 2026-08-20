import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';

/* ── 점수 규칙 (라스베가스 정식 룰) ─────────────────────────────────────────
 * 4라운드 동안 카지노에서 딴 지폐(1만~9만$)의 합이 점수다.
 * 계산할 것은 없고, 라운드마다 각자 딴 금액을 만$ 단위로 적어 누적한다.
 * 동점이면 정식 룰은 지폐 장수가 많은 사람이 승리 — 표는 공동 우승으로 저장한다.
 */
const ROUNDS = 4;

export type LasVegasDraft = {
  current: number;
  /** 라운드(0-based) → memberId → 그 라운드에 딴 돈(만$ 단위 문자열) */
  entries: Record<string, string>[];
};

/** 스토어의 unknown 초안을 안전하게 복원한다. 모양이 어긋나면 새로 시작한다. */
export function coerceLasVegasDraft(v: unknown): LasVegasDraft {
  const fresh: LasVegasDraft = { current: 0, entries: Array.from({ length: ROUNDS }, () => ({})) };
  if (typeof v !== 'object' || v === null) return fresh;
  const o = v as Partial<LasVegasDraft>;
  if (!Array.isArray(o.entries) || o.entries.length !== ROUNDS) return fresh;
  return {
    current: typeof o.current === 'number' && o.current >= 0 && o.current < ROUNDS ? o.current : 0,
    entries: o.entries.map((e) =>
      typeof e === 'object' && e !== null ? (e as Record<string, string>) : {}
    ),
  };
}

const money = (t: string | undefined): number | null => {
  if (!t || t.trim() === '') return null;
  const n = parseInt(t.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function lasVegasTotals(draft: LasVegasDraft, players: Member[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of players) {
    let sum = 0;
    let any = false;
    for (const roundEntries of draft.entries) {
      const m = money(roundEntries[p.id]);
      if (m !== null) {
        sum += m;
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
  onDraftChange: (draft: LasVegasDraft) => void;
  /** 합계를 플레이 기록의 라운드로 저장. 성공 시 true */
  onCommit: (totals: Record<string, number>, winnerIds: string[]) => Promise<boolean>;
  pending: boolean;
  onClose: () => void;
};

/**
 * 라스베가스 점수표 — 라운드마다 딴 지폐 합계(만$)를 적으면 누적을 자동 계산한다.
 * 초안은 스토어(plays store의 toolDraft)에 있어 시트를 닫거나 다른 화면에서 열어도 유지된다.
 */
export function LasVegasSheet({ visible, players, draft: rawDraft, onDraftChange, onCommit, pending, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useMemo(() => coerceLasVegasDraft(rawDraft), [rawDraft]);

  const totals = useMemo(() => lasVegasTotals(draft, players), [draft, players]);
  const ranked = useMemo(
    () => players.filter((p) => totals[p.id] !== undefined).sort((a, b) => totals[b.id] - totals[a.id]),
    [players, totals]
  );
  const topScore = ranked.length ? totals[ranked[0].id] : null;

  const setEntry = (memberId: string, value: string) => {
    const entries = draft.entries.map((roundEntries, i) =>
      i === draft.current ? { ...roundEntries, [memberId]: value } : roundEntries
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
            <Text style={[styles.caption, { color: c.accent }]}>라스베가스 점수표</Text>
            <Text style={[styles.title, { color: c.text }]}>{draft.current + 1}라운드 / {ROUNDS}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* 라운드 선택 — 지나간 라운드 수정도 가능 */}
          <View style={styles.chipRow}>
            {Array.from({ length: ROUNDS }, (_, i) => {
              const done = players.some((p) => money(draft.entries[i][p.id]) !== null);
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

          <Text style={[styles.caption, { color: c.textSecondary }]}>
            라운드가 끝나면 각자 딴 지폐 합계를 만$ 단위로 적으세요. 예: 9만 + 4만 → 13
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
                  styles.moneyInput,
                  { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}
              />
              <Text style={[styles.body, { color: c.textSecondary }]}>만$</Text>
            </View>
          ))}

          {/* 누적 현황 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>누적</Text>
          {ranked.length === 0 && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              금액을 입력하면 자동으로 합산됩니다.
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
                {totals[p.id]}만$
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
            1위가 우승자로, 합계가 개인 점수(만$)로 기록됩니다. 동점은 공동 우승으로 저장돼요 —
            정식 룰(지폐 장수 승부)로 가리려면 저장 후 라운드 기록을 수정하세요.
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
  moneyInput: {
    // 태블릿에서 숫자를 빠르게 치도록 넓고 높게 — 게임중 시트의 점수 입력과 동일 규격
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
