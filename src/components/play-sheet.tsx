import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { GameTimer } from '@/components/game-timer';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useGames } from '@/features/games/hooks';
import { useSession } from '@/features/plays/hooks';
import type { Member, PlayRound } from '@/features/plays/types';
import { useElapsedMinutes } from '@/hooks/use-elapsed-minutes';
import { useTheme } from '@/hooks/use-theme';

/** 라운드 한 줄 요약: "철수, 영희" / "협동 승리" (+메모, +점수) */
export function roundLabel(round: PlayRound, members: Member[]): string {
  let base: string;
  if (round.coop === 'win') base = '협동 승리 🎉';
  else if (round.coop === 'loss') base = '협동 패배';
  else {
    const names = round.winnerIds
      .map((id) => members.find((m) => m.id === id)?.name)
      .filter((n): n is string => !!n);
    base = names.length ? names.join(', ') : '기록 없음';
  }
  if (round.memo) base = `${base} — ${round.memo}`;

  const scoreEntries = Object.entries(round.scores);
  if (scoreEntries.length) {
    const scoreText = scoreEntries
      .sort((a, b) => b[1] - a[1])
      .map(([id, v]) => `${members.find((m) => m.id === id)?.name ?? '?'} ${v}`)
      .join(' · ');
    base = `${base} (${scoreText})`;
  }
  return base;
}

/**
 * 게임중 시트 — 라운드별 우승자·점수·메모 기록, 협동 승/패, 판 메모, 종료.
 * activePlay가 진실이므로 game 정보는 스토어에서 스스로 찾는다.
 */
export function PlaySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { all } = useGames();

  const play = session.activePlay;
  const game = useMemo(() => all.find((g) => g.id === play?.gameId) ?? null, [all, play?.gameId]);
  const players = useMemo(
    () =>
      (play?.memberIds ?? [])
        .map((id) => session.members.find((m) => m.id === id))
        .filter((m): m is Member => !!m),
    [play?.memberIds, session.members]
  );

  const [selectedWinners, setSelectedWinners] = useState<string[]>([]);
  // 라운드 메모·점수는 기록 버튼과 같은 인스턴스에서 즉시 소비되므로 로컬 state로 충분하다.
  const [roundMemo, setRoundMemo] = useState('');
  const [roundScores, setRoundScores] = useState<Record<string, string>>({});
  const [firstPlayer, setFirstPlayer] = useState<string | null>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const elapsed = useElapsedMinutes(play?.startedAt);
  // 판 전체 메모는 스토어 초안 — 시트가 두 곳에 마운트되므로 로컬이면 갈라진다.
  const memo = session.memoDraft;

  // 다른 판이 시작되면 이전 판의 입력이 남아 있으면 안 된다.
  const playId = play?.id;
  useEffect(() => {
    setSelectedWinners([]);
    setRoundMemo('');
    setRoundScores({});
    setFirstPlayer(null);
    setDrawOpen(false);
    setConfirmCancel(false);
  }, [playId]);

  if (!play) return null;

  const parseRoundScores = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [id, text] of Object.entries(roundScores)) {
      const n = parseFloat(text.trim());
      if (text.trim() !== '' && Number.isFinite(n)) out[id] = n;
    }
    return out;
  };

  const clearRoundInputs = () => {
    setSelectedWinners([]);
    setRoundMemo('');
    setRoundScores({});
  };

  const addNormalRound = async () => {
    if (!selectedWinners.length) return;
    const ok = await session.addRound({
      winnerIds: selectedWinners,
      coop: null,
      memo: roundMemo.trim() || null,
      scores: parseRoundScores(),
    });
    if (ok) clearRoundInputs();
  };

  // 협동 승리는 전원 승리로 기록한다 — 통계에서 "이긴 판"으로 세기 위해서다.
  // pending 가드 필수: 라운드 갱신이 배열 전체 덮어쓰기라, 연속 탭이 겹치면 앞선 기록이 유실된다.
  const addCoopRound = (result: 'win' | 'loss') => {
    if (session.pending) return;
    void session
      .addRound({
        winnerIds: result === 'win' ? play.memberIds : [],
        coop: result,
        memo: roundMemo.trim() || null,
        scores: parseRoundScores(),
      })
      .then((ok) => {
        if (ok) clearRoundInputs();
      });
  };

  const drawFirstPlayer = () => {
    const pick = players[Math.floor(Math.random() * players.length)];
    if (pick) {
      setFirstPlayer(pick.name);
      setDrawOpen(true);
    }
  };

  const finish = async () => {
    const ended = await session.endPlay(memo);
    if (ended) {
      clearRoundInputs();
      onClose();
    }
  };

  const cancel = async () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    const ok = await session.cancelPlay();
    setConfirmCancel(false);
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={styles.headerText}>
            <Text style={[styles.caption, { color: c.accent }]}>
              게임중{elapsed !== null && elapsed >= 1 ? ` · ${elapsed}분째` : ''}
            </Text>
            <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {game?.titleKo ?? '알 수 없는 게임'}
            </Text>
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              {players.map((m) => m.name).join(' · ')}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={styles.close}>
            <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* 선 뽑기·턴 타이머 — 테이블 위 도구들. 결과는 가운데 팝업으로 크게 */}
          <View style={styles.chipRow}>
            <Chip label="🎲 선 뽑기" onPress={drawFirstPlayer} />
            <Chip label="⏱️ 타이머" onPress={() => setTimerOpen(true)} />
          </View>

          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>라운드 기록</Text>

          {play.rounds.length === 0 && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              아직 기록이 없어요. 라운드가 끝나면 우승자를 골라 기록하세요.
            </Text>
          )}
          {play.rounds.map((round, i) => (
            <View
              key={`${i}-${round.winnerIds.join('.')}-${round.coop}`}
              style={[styles.roundRow, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Text style={[styles.roundIndex, { color: c.textSecondary }]}>{i + 1}R</Text>
              <Text style={[styles.roundText, { color: c.text }]} numberOfLines={2}>
                {roundLabel(round, session.members)}
              </Text>
              <Pressable
                onPress={() => {
                  if (!session.pending) void session.removeRound(i);
                }}
                disabled={session.pending}
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}라운드 삭제`}
                style={[styles.roundDelete, { opacity: session.pending ? 0.4 : 1 }]}>
                <Text style={[styles.caption, { color: c.textSecondary }]}>✕</Text>
              </Pressable>
            </View>
          ))}

          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>이번 라운드 우승자</Text>
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

          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>이번 라운드 점수 (선택)</Text>
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
                style={[
                  styles.scoreInput,
                  { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}
              />
            </View>
          ))}

          <TextInput
            value={roundMemo}
            onChangeText={setRoundMemo}
            placeholder="라운드 메모 (선택) — 막판 역전, 신기록…"
            placeholderTextColor={c.textSecondary}
            style={[
              styles.roundMemoInput,
              { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
            ]}
          />
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => void addNormalRound()}
              disabled={session.pending || selectedWinners.length === 0}
              accessibilityRole="button"
              style={[
                styles.recordButton,
                { backgroundColor: c.accent, opacity: session.pending || !selectedWinners.length ? 0.4 : 1 },
              ]}>
              <Text style={[styles.buttonText, { color: c.onAccent }]}>
                {selectedWinners.length > 1 ? `공동 우승 ${selectedWinners.length}명 기록` : '우승 기록'}
              </Text>
            </Pressable>
            <Chip label="협동 승리" disabled={session.pending} onPress={() => addCoopRound('win')} />
            <Chip label="협동 패배" disabled={session.pending} onPress={() => addCoopRound('loss')} />
          </View>

          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>메모</Text>
          <TextInput
            value={memo}
            onChangeText={session.setMemoDraft}
            placeholder="확장 룰로 진행, 다음엔 변형 규칙으로…"
            placeholderTextColor={c.textSecondary}
            multiline
            style={[
              styles.memo,
              { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
            ]}
          />

          {session.actionError && (
            <Text style={[styles.caption, { color: c.danger }]}>{session.actionError}</Text>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + Spacing.three }]}>
          <Pressable
            onPress={() => void cancel()}
            disabled={session.pending}
            accessibilityRole="button"
            style={[styles.footerButton, styles.cancelButton, { borderColor: c.danger }]}>
            <Text style={[styles.buttonText, { color: c.danger }]}>
              {confirmCancel ? '기록 없이 취소할까요?' : '시작 취소'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void finish()}
            disabled={session.pending}
            accessibilityRole="button"
            style={[
              styles.footerButton,
              styles.endButton,
              { backgroundColor: c.accent, opacity: session.pending ? 0.5 : 1 },
            ]}>
            <Text style={[styles.buttonText, { color: c.onAccent }]}>
              {session.pending ? '처리 중…' : '게임 종료'}
            </Text>
          </Pressable>
        </View>

        <GameTimer visible={timerOpen} onClose={() => setTimerOpen(false)} />

        {/* 선 플레이어 팝업 — 테이블 건너편에서도 보이게 가운데에 크게 */}
        <Modal visible={drawOpen} transparent animationType="fade" onRequestClose={() => setDrawOpen(false)}>
          <Pressable style={styles.drawBackdrop} onPress={() => setDrawOpen(false)}>
            <Pressable
              style={[styles.drawCard, { backgroundColor: c.backgroundElement, borderColor: c.accent }]}
              onPress={() => undefined}>
              <Text style={[styles.caption, { color: c.textSecondary }]}>선 플레이어</Text>
              <Text style={[styles.drawName, { color: c.accent }]} numberOfLines={1}>
                {firstPlayer}
              </Text>
              <View style={styles.chipRow}>
                <Chip label="다시 뽑기" onPress={drawFirstPlayer} />
                <Chip label="확인" selected onPress={() => setDrawOpen(false)} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
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
  caption: { ...Typography.caption },
  body: { ...Typography.body },
  close: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  // 10인치 태블릿에서 입력 줄이 화면 끝까지 늘어지지 않게 중앙 720으로 제한한다.
  content: { padding: Spacing.four, gap: Spacing.two, maxWidth: 720, width: '100%', alignSelf: 'center' },
  sectionLabel: { ...Typography.label, marginTop: Spacing.three },
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
  roundIndex: { ...Typography.caption, width: 30 },
  roundText: { ...Typography.body, flex: 1 },
  roundDelete: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  recordButton: {
    minHeight: TouchTarget.primary,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
  },
  buttonText: { ...Typography.body, fontWeight: '600' },
  roundMemoInput: {
    minHeight: TouchTarget.min,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  scoreInput: {
    // 태블릿에서 숫자를 빠르게 치도록 넓고 높게
    width: 150,
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    textAlign: 'right',
    fontSize: 22,
    lineHeight: 28,
  },
  memo: {
    minHeight: 80,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.three,
    textAlignVertical: 'top',
    ...Typography.body,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
  },
  cancelButton: { borderWidth: 1 },
  endButton: { flex: 1 },
  drawBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: Spacing.five,
  },
  drawCard: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.six,
    borderRadius: Radius.lg,
    borderWidth: 2,
    minWidth: 280,
  },
  drawName: { fontSize: 52, lineHeight: 68, fontWeight: '400', fontFamily: 'Jua_400Regular' },
});
