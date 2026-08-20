import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';

/* ── 정산 규칙 (시타델 정식 룰) ─────────────────────────────────────────────
 * 게임 종료 시:
 * - 지은 건물들의 금화 가치 합
 * - +3: 5색(귀족·종교·교역·군사·특수) 건물을 모두 보유
 * - +4: 가장 먼저 8건물을 완성한 사람 (한 명뿐)
 * - +2: 그 외 8건물을 완성한 사람
 * - 보라 건물의 추가 점수(용문 +2, 대학 +2 등)는 '추가 점수'에 직접 적는다
 */
type Entry = {
  base: string;
  extra: string;
  fiveColors: boolean;
  /** 8건물 완성 — first면 +4, 아니면 +2 */
  complete: boolean;
  first: boolean;
};

const EMPTY: Entry = { base: '', extra: '', fiveColors: false, complete: false, first: false };

export type CitadelsDraft = {
  entries: Record<string, Entry>;
};

/** 스토어의 unknown 초안을 안전하게 복원한다. 모양이 어긋나면 새로 시작한다. */
export function coerceCitadelsDraft(v: unknown): CitadelsDraft {
  if (typeof v !== 'object' || v === null) return { entries: {} };
  const o = v as Partial<CitadelsDraft>;
  if (typeof o.entries !== 'object' || o.entries === null || Array.isArray(o.entries)) {
    return { entries: {} };
  }
  return { entries: o.entries as Record<string, Entry> };
}

const num = (t: string | undefined): number | null => {
  if (!t || t.trim() === '') return null;
  const n = parseInt(t.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function citadelsScore(entry: Entry | undefined): number | null {
  if (!entry) return null;
  const base = num(entry.base);
  const extra = num(entry.extra);
  const hasInput = base !== null || extra !== null || entry.fiveColors || entry.complete || entry.first;
  if (!hasInput) return null;
  return (
    (base ?? 0) +
    (extra ?? 0) +
    (entry.fiveColors ? 3 : 0) +
    (entry.first ? 4 : entry.complete ? 2 : 0)
  );
}

export function citadelsTotals(draft: CitadelsDraft, players: Member[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of players) {
    const s = citadelsScore(draft.entries[p.id]);
    if (s !== null) totals[p.id] = s;
  }
  return totals;
}

type Props = {
  visible: boolean;
  players: Member[];
  draft: unknown;
  onDraftChange: (draft: CitadelsDraft) => void;
  /** 합계를 플레이 기록의 라운드로 저장. 성공 시 true */
  onCommit: (totals: Record<string, number>, winnerIds: string[]) => Promise<boolean>;
  pending: boolean;
  onClose: () => void;
};

/**
 * 시타델 정산 도우미 — 건물 합계와 보너스를 고르면 최종 점수를 계산한다.
 * '첫 8건물 +4'는 한 명뿐이라 다른 사람에게 주면 이전 사람은 자동 해제된다.
 */
export function CitadelsSheet({ visible, players, draft: rawDraft, onDraftChange, onCommit, pending, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useMemo(() => coerceCitadelsDraft(rawDraft), [rawDraft]);

  const totals = useMemo(() => citadelsTotals(draft, players), [draft, players]);
  const ranked = useMemo(
    () => players.filter((p) => totals[p.id] !== undefined).sort((a, b) => totals[b.id] - totals[a.id]),
    [players, totals]
  );
  const topScore = ranked.length ? totals[ranked[0].id] : null;

  const setEntry = (memberId: string, patch: Partial<Entry>) => {
    const prev = draft.entries[memberId] ?? EMPTY;
    let entries = { ...draft.entries, [memberId]: { ...prev, ...patch } };
    // 첫 완성은 한 명뿐 — 다른 사람의 first를 해제한다
    if (patch.first) {
      entries = Object.fromEntries(
        Object.entries(entries).map(([id, e]) => [id, id === memberId ? e : { ...e, first: false }])
      );
    }
    onDraftChange({ entries });
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
            <Text style={[styles.caption, { color: c.accent }]}>시타델</Text>
            <Text style={[styles.title, { color: c.text }]}>정산 도우미</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.caption, { color: c.textSecondary }]}>
            건물 금화 합계를 적고 해당하는 보너스를 켜세요. 보라 건물 추가 점수(용문·대학 등)는
            '추가'에 직접 적으면 됩니다.
          </Text>

          {players.map((p) => {
            const entry = draft.entries[p.id] ?? EMPTY;
            const score = citadelsScore(entry);
            return (
              <View
                key={p.id}
                style={[styles.playerCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                <View style={styles.playerHead}>
                  <Text style={[styles.subtitle, { color: c.text, flex: 1 }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[styles.subtitle, { color: score === null ? c.textSecondary : c.accent }]}>
                    {score === null ? '·' : `${score}점`}
                  </Text>
                </View>
                <View style={styles.inputLine}>
                  <Text style={[styles.caption, { color: c.textSecondary, width: 56 }]}>건물 합</Text>
                  <TextInput
                    value={entry.base}
                    onChangeText={(v) => setEntry(p.id, { base: v })}
                    placeholder="0"
                    placeholderTextColor={c.textSecondary}
                    keyboardType="number-pad"
                    style={[styles.numInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
                  />
                  <Text style={[styles.caption, { color: c.textSecondary, width: 40, textAlign: 'right' }]}>추가</Text>
                  <TextInput
                    value={entry.extra}
                    onChangeText={(v) => setEntry(p.id, { extra: v })}
                    placeholder="0"
                    placeholderTextColor={c.textSecondary}
                    keyboardType="number-pad"
                    style={[styles.numInput, { color: c.text, backgroundColor: c.background, borderColor: c.border }]}
                  />
                </View>
                <View style={styles.chipRow}>
                  <Chip
                    label="5색 +3"
                    selected={entry.fiveColors}
                    onPress={() => setEntry(p.id, { fiveColors: !entry.fiveColors })}
                  />
                  <Chip
                    label="첫 8건물 +4"
                    selected={entry.first}
                    onPress={() => setEntry(p.id, { first: !entry.first, complete: false })}
                  />
                  <Chip
                    label="8건물 +2"
                    selected={!entry.first && entry.complete}
                    onPress={() => setEntry(p.id, { complete: !entry.complete, first: false })}
                  />
                </View>
              </View>
            );
          })}

          {/* 최종 순위 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>최종 점수</Text>
          {ranked.length === 0 && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              건물 합계를 입력하면 자동으로 계산됩니다.
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
              {pending ? '저장 중…' : '최종 점수를 플레이 기록에 저장'}
            </Text>
          </Pressable>
          <Text style={[styles.caption, { color: c.textSecondary, textAlign: 'center' }]}>
            1위가 우승자로, 최종 점수가 개인 점수로 기록됩니다. 동점이면 공동 우승으로 저장돼요.
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
  subtitle: { ...Typography.subtitle },
  body: { ...Typography.body },
  caption: { ...Typography.caption },
  close: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.two, maxWidth: 720, width: '100%', alignSelf: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sectionLabel: { ...Typography.label, marginTop: Spacing.three },
  playerCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  playerHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inputLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  numInput: {
    flex: 1,
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    textAlign: 'right',
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
