import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';

/* ── 정산 규칙 (캐스캐디아 정식 룰) ─────────────────────────────────────────
 * 최종 점수 = 동물 점수(선택한 동물 카드 기준) + 서식지 점수(종류별 최대 연결
 * 크기) + 서식지 보너스 + 자연 토큰(1개 1점).
 * 보너스: 2인 — 종류별 최대 +2(동점 각 +1) / 3~4인 — 최대 +3, 2위 +1
 * (최대 동점 2명 각 +2, 3명 이상 각 +1, 2위 동점은 0점).
 * 상자의 종이 점수패드와 같은 4칸 구조다.
 */
type Entry = { wildlife: string; habitat: string; bonus: string; tokens: string };

const EMPTY: Entry = { wildlife: '', habitat: '', bonus: '', tokens: '' };

export type CascadiaDraft = {
  entries: Record<string, Entry>;
};

/** 스토어의 unknown 초안을 안전하게 복원한다. 모양이 어긋나면 새로 시작한다. */
export function coerceCascadiaDraft(v: unknown): CascadiaDraft {
  if (typeof v !== 'object' || v === null) return { entries: {} };
  const o = v as Partial<CascadiaDraft>;
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

export function cascadiaScore(entry: Entry | undefined): number | null {
  if (!entry) return null;
  const parts = [num(entry.wildlife), num(entry.habitat), num(entry.bonus), num(entry.tokens)];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
}

export function cascadiaTotals(draft: CascadiaDraft, players: Member[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of players) {
    const s = cascadiaScore(draft.entries[p.id]);
    if (s !== null) totals[p.id] = s;
  }
  return totals;
}

type Props = {
  visible: boolean;
  players: Member[];
  draft: unknown;
  onDraftChange: (draft: CascadiaDraft) => void;
  /** 합계를 플레이 기록의 라운드로 저장. 성공 시 true */
  onCommit: (totals: Record<string, number>, winnerIds: string[]) => Promise<boolean>;
  pending: boolean;
  onClose: () => void;
};

/**
 * 캐스캐디아 정산표 — 동물·서식지·보너스·자연 토큰 네 칸을 적으면 합계를 계산한다.
 * 상자에 든 종이 점수패드를 그대로 옮긴 구조라 헷갈릴 것이 없다.
 */
export function CascadiaSheet({ visible, players, draft: rawDraft, onDraftChange, onCommit, pending, onClose }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useMemo(() => coerceCascadiaDraft(rawDraft), [rawDraft]);

  const totals = useMemo(() => cascadiaTotals(draft, players), [draft, players]);
  const ranked = useMemo(
    () => players.filter((p) => totals[p.id] !== undefined).sort((a, b) => totals[b.id] - totals[a.id]),
    [players, totals]
  );
  const topScore = ranked.length ? totals[ranked[0].id] : null;

  const setEntry = (memberId: string, patch: Partial<Entry>) => {
    const prev = draft.entries[memberId] ?? EMPTY;
    onDraftChange({ entries: { ...draft.entries, [memberId]: { ...prev, ...patch } } });
  };

  const commit = async () => {
    if (topScore === null) return;
    const winnerIds = ranked.filter((p) => totals[p.id] === topScore).map((p) => p.id);
    const ok = await onCommit(totals, winnerIds);
    if (ok) onClose();
  };

  const fields: { key: keyof Entry; label: string }[] = [
    { key: 'wildlife', label: '🐻 동물' },
    { key: 'habitat', label: '🗺️ 서식지' },
    { key: 'bonus', label: '🏅 보너스' },
    { key: 'tokens', label: '🌰 토큰' },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={styles.headerText}>
            <Text style={[styles.caption, { color: c.accent }]}>캐스캐디아</Text>
            <Text style={[styles.title, { color: c.text }]}>정산표</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.caption, { color: c.textSecondary }]}>
            동물 점수(동물 카드 기준)·서식지 점수(종류별 최대 연결 크기)·보너스·자연 토큰(1개
            1점)을 적으세요.
          </Text>

          {players.map((p) => {
            const entry = draft.entries[p.id] ?? EMPTY;
            const score = cascadiaScore(entry);
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
                  {fields.map((f) => (
                    <View key={f.key} style={styles.inputCol}>
                      <Text style={[styles.caption, { color: c.textSecondary }]}>{f.label}</Text>
                      <TextInput
                        value={entry[f.key]}
                        onChangeText={(v) => setEntry(p.id, { [f.key]: v })}
                        placeholder="0"
                        placeholderTextColor={c.textSecondary}
                        keyboardType="number-pad"
                        style={[
                          styles.numInput,
                          { color: c.text, backgroundColor: c.background, borderColor: c.border },
                        ]}
                      />
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          {/* 보너스 규칙 참조 */}
          <View style={[styles.refCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              서식지 보너스 (종류별) — 2인: 최대 +2, 동점 각 +1 · 3~4인: 최대 +3, 2위 +1
              (최대 동점 2명 각 +2 / 3명 이상 각 +1, 2위 동점은 0점)
            </Text>
          </View>

          {/* 최종 순위 */}
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>최종 점수</Text>
          {ranked.length === 0 && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              점수를 입력하면 자동으로 계산됩니다.
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
            1위가 우승자로, 최종 점수가 개인 점수로 기록됩니다. 동점이면 공동 우승으로 저장돼요
            (정식 룰은 자연 토큰 많은 사람 승).
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
  sectionLabel: { ...Typography.label, marginTop: Spacing.three },
  playerCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  playerHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inputLine: { flexDirection: 'row', gap: Spacing.two },
  inputCol: { flex: 1, gap: 2 },
  numInput: {
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    textAlign: 'right',
    fontSize: 20,
    lineHeight: 26,
  },
  refCard: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
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
