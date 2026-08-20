import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';

/* ── 점수 규칙 (플립 7 정식 룰) ─────────────────────────────────────────────
 * 라운드마다 각자 얻은 점수(카드 합 + 보너스, 버스트는 0)를 적어 누적한다.
 * 라운드 끝에 누군가 200점을 넘으면 게임 종료 — 최고점이 우승.
 * 숫자 7장을 모으면 +15 보너스와 함께 라운드가 즉시 끝난다(점수에 포함해 적는다).
 */
const TARGET = 200;
/** 폭주 방지 상한 — 실제 게임은 보통 5~10라운드면 끝난다 */
const MAX_ROUNDS = 30;

export type Flip7Draft = {
  current: number;
  /** 라운드(0-based) → memberId → 그 라운드 점수 문자열. 길이는 가변 */
  entries: Record<string, string>[];
};

/** 스토어의 unknown 초안을 안전하게 복원한다. 모양이 어긋나면 새로 시작한다. */
export function coerceFlip7Draft(v: unknown): Flip7Draft {
  const fresh: Flip7Draft = { current: 0, entries: [{}] };
  if (typeof v !== 'object' || v === null) return fresh;
  const o = v as Partial<Flip7Draft>;
  if (!Array.isArray(o.entries) || o.entries.length < 1 || o.entries.length > MAX_ROUNDS) return fresh;
  const entries = o.entries.map((e) =>
    typeof e === 'object' && e !== null ? (e as Record<string, string>) : {}
  );
  return {
    current:
      typeof o.current === 'number' && o.current >= 0 && o.current < entries.length ? o.current : 0,
    entries,
  };
}

const num = (t: string | undefined): number | null => {
  if (!t || t.trim() === '') return null;
  const n = parseInt(t.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function flip7Totals(draft: Flip7Draft, players: Member[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of players) {
    let sum = 0;
    let any = false;
    for (const roundEntries of draft.entries) {
      const s = num(roundEntries[p.id]);
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
  onDraftChange: (draft: Flip7Draft) => void;
  /** 합계를 플레이 기록의 라운드로 저장. 성공 시 true */
  onCommit: (totals: Record<string, number>, winnerIds: string[]) => Promise<boolean>;
  pending: boolean;
  onClose: () => void;
};

/**
 * 플립 7 점수표 — 라운드 점수를 적으면 누적을 계산하고 200점 도달을 표시한다.
 * 라운드 수가 정해져 있지 않아 '+' 칩으로 필요한 만큼 늘린다.
 * 초안은 스토어(plays store의 toolDraft)에 있어 시트를 닫아도 유지된다.
 */
export function Flip7Sheet({ visible, players, draft: rawDraft, onDraftChange, onCommit, pending, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useMemo(() => coerceFlip7Draft(rawDraft), [rawDraft]);

  const totals = useMemo(() => flip7Totals(draft, players), [draft, players]);
  const ranked = useMemo(
    () => players.filter((p) => totals[p.id] !== undefined).sort((a, b) => totals[b.id] - totals[a.id]),
    [players, totals]
  );
  const topScore = ranked.length ? totals[ranked[0].id] : null;
  const reached = topScore !== null && topScore >= TARGET;

  const setEntry = (memberId: string, value: string) => {
    const entries = draft.entries.map((roundEntries, i) =>
      i === draft.current ? { ...roundEntries, [memberId]: value } : roundEntries
    );
    onDraftChange({ ...draft, entries });
  };

  const addRound = () => {
    if (draft.entries.length >= MAX_ROUNDS) return;
    onDraftChange({ current: draft.entries.length, entries: [...draft.entries, {}] });
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
            <Text style={[styles.caption, { color: c.accent }]}>플립 7 점수표</Text>
            <Text style={[styles.title, { color: c.text }]}>{draft.current + 1}라운드</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* 라운드 선택 — 지나간 라운드 수정도 가능, '+'로 다음 라운드 추가 */}
          <View style={styles.chipRow}>
            {draft.entries.map((roundEntries, i) => {
              const done = players.some((p) => num(roundEntries[p.id]) !== null);
              return (
                <Chip
                  key={i}
                  label={`${i + 1}R${done ? ' ✓' : ''}`}
                  selected={draft.current === i}
                  onPress={() => onDraftChange({ ...draft, current: i })}
                />
              );
            })}
            {draft.entries.length < MAX_ROUNDS && <Chip label="＋ 라운드" onPress={addRound} />}
          </View>

          <Text style={[styles.caption, { color: c.textSecondary }]}>
            라운드 점수(카드 합 + 보너스)를 적으세요. 버스트는 0, 7장 성공은 +15를 더해서.
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

          {/* 누적 현황 — 200점 도달자는 깃발 표시 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
            누적 (목표 {TARGET}점)
          </Text>
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
                {totals[p.id] >= TARGET ? ' 🏁' : ''}
              </Text>
              <Text style={[styles.totalScore, { color: i === 0 ? c.accent : c.text }]}>
                {totals[p.id]}점
              </Text>
            </View>
          ))}
          {reached && (
            <Text style={[styles.caption, { color: c.accent }]}>
              🏁 {TARGET}점 도달! 이번 라운드로 게임 종료 — 저장하세요.
            </Text>
          )}
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
