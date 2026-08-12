import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { roundLabel } from '@/components/play-sheet';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { updatePlayRecord, type PlayWithGame } from '@/features/plays/queries';
import type { Member, Play, PlayRound } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';
import { localDateOf } from '@/lib/dates';

type Props = {
  play: PlayWithGame;
  /** 등록된 전체 멤버 — 판 참여자 이름 해석용 */
  members: Member[];
  onClose: () => void;
  onSaved: (updated: Play) => void;
};

/**
 * 지난 기록 편집 — 끝난 판의 라운드·메모·개인 점수를 고친다.
 * 게임중 시트와 달리 저장 버튼을 누를 때까지 서버에 쓰지 않는다.
 * 지난 기록은 실시간성이 없고, 편집 도중 상태가 반쯤 저장되면 더 헷갈리기 때문이다.
 */
export function PlayEditor({ play, members, onClose, onSaved }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  const players = play.memberIds
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => !!m);

  const [rounds, setRounds] = useState<PlayRound[]>(play.rounds);
  const [memo, setMemo] = useState(play.memo ?? '');
  const [selectedWinners, setSelectedWinners] = useState<string[]>([]);
  const [roundMemo, setRoundMemo] = useState('');
  const [roundScores, setRoundScores] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseRoundScores = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [id, text] of Object.entries(roundScores)) {
      const n = parseFloat(text.trim());
      if (text.trim() !== '' && Number.isFinite(n)) out[id] = n;
    }
    return out;
  };

  const addRound = (round: PlayRound) => {
    setRounds((prev) => [...prev, round]);
    setSelectedWinners([]);
    setRoundMemo('');
    setRoundScores({});
  };

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      // 점수는 라운드 안(rounds[].scores)에 들어간다. 판 단위 scores(레거시)는 건드리지 않는다.
      const updated = await updatePlayRecord(play.id, {
        rounds,
        memo: memo.trim() || null,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={styles.headerText}>
            <Text style={[styles.caption, { color: c.accent }]}>기록 편집</Text>
            <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {play.gameTitle}
            </Text>
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              {play.endedAt ? localDateOf(play.endedAt) : ''} ·{' '}
              {players.map((m) => m.name).join(' · ')}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>라운드</Text>
          {rounds.length === 0 && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>라운드 기록이 없어요.</Text>
          )}
          {rounds.map((round, i) => (
            <View
              key={`${i}-${round.winnerIds.join('.')}-${round.coop}`}
              style={[styles.roundRow, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.caption, { color: c.textSecondary, width: 30 }]}>{i + 1}R</Text>
              <Text style={[styles.body, { color: c.text, flex: 1 }]} numberOfLines={2}>
                {roundLabel(round, members)}
              </Text>
              <Pressable
                onPress={() => setRounds((prev) => prev.filter((_, x) => x !== i))}
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}라운드 삭제`}
                style={styles.roundDelete}>
                <Text style={[styles.caption, { color: c.textSecondary }]}>✕</Text>
              </Pressable>
            </View>
          ))}

          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>라운드 추가</Text>
          <View style={styles.chipRow}>
            {players.map((m) => (
              <Chip
                key={m.id}
                label={m.name}
                selected={selectedWinners.includes(m.id)}
                onPress={() =>
                  setSelectedWinners((prev) =>
                    prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                  )
                }
              />
            ))}
          </View>
          {players.map((m) => (
            <View key={m.id} style={styles.scoreRow}>
              <Text style={[styles.body, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {m.name}
              </Text>
              <TextInput
                value={roundScores[m.id] ?? ''}
                onChangeText={(v) => setRoundScores((prev) => ({ ...prev, [m.id]: v }))}
                placeholder="점수"
                placeholderTextColor={c.textSecondary}
                keyboardType="numbers-and-punctuation"
                style={[styles.scoreInput, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
              />
            </View>
          ))}
          <TextInput
            value={roundMemo}
            onChangeText={setRoundMemo}
            placeholder="라운드 메모 (선택)"
            placeholderTextColor={c.textSecondary}
            style={[styles.input, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
          />
          <View style={styles.chipRow}>
            <Chip
              label={selectedWinners.length > 1 ? `공동 우승 ${selectedWinners.length}명` : '우승 기록'}
              disabled={!selectedWinners.length}
              onPress={() =>
                addRound({
                  winnerIds: selectedWinners,
                  coop: null,
                  memo: roundMemo.trim() || null,
                  scores: parseRoundScores(),
                })
              }
            />
            <Chip
              label="협동 승리"
              onPress={() =>
                addRound({
                  winnerIds: play.memberIds,
                  coop: 'win',
                  memo: roundMemo.trim() || null,
                  scores: parseRoundScores(),
                })
              }
            />
            <Chip
              label="협동 패배"
              onPress={() =>
                addRound({
                  winnerIds: [],
                  coop: 'loss',
                  memo: roundMemo.trim() || null,
                  scores: parseRoundScores(),
                })
              }
            />
          </View>

          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>메모</Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            placeholder="판 전체 메모"
            placeholderTextColor={c.textSecondary}
            multiline
            style={[
              styles.input,
              styles.memo,
              { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
            ]}
          />

          {error && <Text style={[styles.caption, { color: c.danger }]}>{error}</Text>}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + Spacing.three }]}>
          <Pressable
            onPress={() => void save()}
            disabled={pending}
            accessibilityRole="button"
            style={[styles.saveButton, { backgroundColor: c.accent, opacity: pending ? 0.5 : 1 }]}>
            <Text style={[styles.buttonText, { color: c.onAccent }]}>
              {pending ? '저장 중…' : '저장'}
            </Text>
          </Pressable>
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
  sectionLabel: { ...Typography.label, marginTop: Spacing.three },
  close: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.two, maxWidth: 720, width: '100%', alignSelf: 'center' },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  roundDelete: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  input: {
    minHeight: TouchTarget.min,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  memo: { minHeight: 80, paddingTop: Spacing.two, textAlignVertical: 'top' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  scoreInput: {
    width: 110,
    minHeight: TouchTarget.min,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    textAlign: 'right',
    ...Typography.body,
  },
  footer: { padding: Spacing.four, borderTopWidth: StyleSheet.hairlineWidth },
  saveButton: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  buttonText: { ...Typography.body, fontWeight: '600' },
});
