import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';

/* ── 점수 규칙 (젝스님트! 정식 룰) ──────────────────────────────────────────
 * 라운드마다 가져간 소 머리(벌점)를 적어 누적한다. 누군가 66점에 도달하면
 * 게임 종료 — 벌점이 가장 "적은" 사람이 우승이다. 다른 점수표와 방향이 반대!
 */
const LIMIT = 66;
/** 폭주 방지 상한 — 실제 게임은 보통 몇 라운드면 끝난다 */
const MAX_ROUNDS = 30;

export type SechsNimmtDraft = {
  current: number;
  /** 라운드(0-based) → memberId → 그 라운드 벌점 문자열. 길이는 가변 */
  entries: Record<string, string>[];
};

/** 스토어의 unknown 초안을 안전하게 복원한다. 모양이 어긋나면 새로 시작한다. */
export function coerceSechsNimmtDraft(v: unknown): SechsNimmtDraft {
  const fresh: SechsNimmtDraft = { current: 0, entries: [{}] };
  if (typeof v !== 'object' || v === null) return fresh;
  const o = v as Partial<SechsNimmtDraft>;
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

export function sechsNimmtTotals(draft: SechsNimmtDraft, players: Member[]): Record<string, number> {
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
  onDraftChange: (draft: SechsNimmtDraft) => void;
  /** 벌점 합계를 플레이 기록의 라운드로 저장. 성공 시 true */
  onCommit: (totals: Record<string, number>, winnerIds: string[]) => Promise<boolean>;
  pending: boolean;
  onClose: () => void;
};

/**
 * 젝스님트! 벌점표 — 라운드 벌점을 적으면 누적을 계산하고 66점 도달을 표시한다.
 * 유일하게 "낮을수록 좋은" 점수표라 순위가 오름차순이고 최저 벌점이 우승이다.
 * 초안은 스토어(plays store의 toolDraft)에 있어 시트를 닫아도 유지된다.
 */
export function SechsNimmtSheet({ visible, players, draft: rawDraft, onDraftChange, onCommit, pending, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useMemo(() => coerceSechsNimmtDraft(rawDraft), [rawDraft]);

  const totals = useMemo(() => sechsNimmtTotals(draft, players), [draft, players]);
  // 벌점이라 오름차순 — 가장 적게 받은 사람이 1위
  const ranked = useMemo(
    () => players.filter((p) => totals[p.id] !== undefined).sort((a, b) => totals[a.id] - totals[b.id]),
    [players, totals]
  );
  const bestScore = ranked.length ? totals[ranked[0].id] : null;
  const gameOver = ranked.some((p) => totals[p.id] >= LIMIT);

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
    if (bestScore === null) return;
    const winnerIds = ranked.filter((p) => totals[p.id] === bestScore).map((p) => p.id);
    const ok = await onCommit(totals, winnerIds);
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={styles.headerText}>
            <Text style={[styles.caption, { color: c.accent }]}>젝스님트! 벌점표</Text>
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
            이번 라운드에 가져간 소 머리 수(벌점)를 적으세요. 안 받았으면 0.
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
              <Text style={[styles.body, { color: c.textSecondary }]}>🐮</Text>
            </View>
          ))}

          {/* 누적 현황 — 벌점이라 적은 순, 66점 도달자는 💀 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
            누적 벌점 (적을수록 좋아요 · {LIMIT}점이면 종료)
          </Text>
          {ranked.length === 0 && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              벌점을 입력하면 자동으로 합산됩니다.
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
                {totals[p.id] >= LIMIT ? ' 💀' : ''}
              </Text>
              <Text style={[styles.totalScore, { color: i === 0 ? c.accent : c.text }]}>
                {totals[p.id]}점
              </Text>
            </View>
          ))}
          {gameOver && (
            <Text style={[styles.caption, { color: c.accent }]}>
              💀 {LIMIT}점 도달! 게임 종료 — 벌점이 가장 적은 사람이 우승입니다. 저장하세요.
            </Text>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + Spacing.three }]}>
          <Pressable
            onPress={() => void commit()}
            disabled={pending || bestScore === null}
            accessibilityRole="button"
            style={[
              styles.commitButton,
              { backgroundColor: c.accent, opacity: pending || bestScore === null ? 0.4 : 1 },
            ]}>
            <Text style={[styles.commitText, { color: c.onAccent }]}>
              {pending ? '저장 중…' : '벌점을 플레이 기록에 저장'}
            </Text>
          </Pressable>
          <Text style={[styles.caption, { color: c.textSecondary, textAlign: 'center' }]}>
            벌점이 가장 적은 사람이 우승자로 기록됩니다. 점수는 벌점 그대로 저장돼요 — 이
            게임에선 낮을수록 좋은 기록입니다.
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
