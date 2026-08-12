import { Image } from 'expo-image';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/chip';
import { PlaySheet, roundLabel } from '@/components/play-sheet';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { gameImageUrl } from '@/features/games/images';
import { playerFit, playtimeLabel, weightLabel } from '@/features/games/recommend';
import type { Game } from '@/features/games/types';
import { useSession } from '@/features/plays/hooks';
import { fetchRecentPlays } from '@/features/plays/queries';
import type { Play } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';
import { localDateOf } from '@/lib/dates';

const FIELD_LABEL: Record<string, string> = {
  player_counts: '인원',
  recommended_counts: '추천 인원',
  best_count: '베스트 인원',
  playtime: '플레이타임',
  weight: '난이도',
  categories: '카테고리',
};

export function GameDetail({
  game,
  playerCount,
  onClose,
  onEdit,
}: {
  game: Game;
  playerCount: number | null;
  onClose?: () => void;
  onEdit?: () => void;
}) {
  const c = useTheme();
  const session = useSession();
  const imageUrl = gameImageUrl(game);

  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [gamePlays, setGamePlays] = useState<Play[]>([]);

  const isActive = session.activePlay?.gameId === game.id;
  const otherGameActive = session.activePlay !== null && !isActive;
  const canStart =
    game.owned && session.ready && !session.error && session.memberIds.length > 0 && !session.activePlay;

  // 이 게임의 플레이 이력(전적·최근 기록용). 실패하면 섹션을 숨길 뿐 상세 자체는 살린다.
  useEffect(() => {
    let alive = true;
    fetchRecentPlays(game.id, 50)
      .then((plays) => {
        if (alive) setGamePlays(plays);
      })
      .catch(() => {
        if (alive) setGamePlays([]);
      });
    return () => {
      alive = false;
    };
    // 판이 끝나거나 빠른 기록이 되면 playCount가 바뀐다 — 그때 이력도 다시 받는다.
  }, [game.id, game.playCount, session.activePlay]);

  const recentPlays = gamePlays.slice(0, 3);

  // 전적 — 최고 점수와 승자 분포. 점수·우승 기록이 없으면 표시하지 않는다.
  const record = useMemo(() => {
    let best: { score: number; memberId: string; date: string } | null = null;
    const wins = new Map<string, number>();
    for (const play of gamePlays) {
      // 라운드별 점수가 기본, 판 단위 scores는 레거시 후보
      const candidates: [string, number][] = [
        ...Object.entries(play.scores),
        ...play.rounds.flatMap((r) => Object.entries(r.scores)),
      ];
      for (const [memberId, score] of candidates) {
        if (!best || score > best.score)
          best = { score, memberId, date: play.endedAt ? localDateOf(play.endedAt) : '' };
      }
      for (const round of play.rounds) {
        for (const id of round.winnerIds) wins.set(id, (wins.get(id) ?? 0) + 1);
      }
    }
    const name = (id: string) => session.members.find((m) => m.id === id)?.name ?? '?';
    const winners = [...wins.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => `${name(id)} ${n}승`)
      .join(' · ');
    return {
      bestScore: best ? `${best.score}점 · ${name(best.memberId)} (${best.date})` : null,
      winners: winners || null,
    };
  }, [gamePlays, session.members]);

  const startGame = async () => {
    const play = await session.startPlay(game.id);
    if (play) setSheetOpen(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background, borderColor: c.border }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: c.text }]}>{game.titleKo}</Text>
            {game.titleEn && (
              <Text style={[styles.body, { color: c.textSecondary }]}>{game.titleEn}</Text>
            )}
          </View>
          {onClose && (
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
              <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
            </Pressable>
          )}
        </View>

        {imageUrl && (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.cover, { backgroundColor: c.backgroundSelected }]}
            contentFit="contain"
            transition={150}
            accessibilityIgnoresInvertColors
          />
        )}

        <View style={styles.badgeRow}>
          {isActive && <Badge label="게임중" color={c.accent} />}
          {!game.owned && <Badge label="위시리스트 — 아직 집에 없음" color={c.accent} />}
          {playerCount !== null && playerFit(game, playerCount) === 'best' && (
            <Badge label={`${playerCount}인 베스트`} color={c.badgeBest} />
          )}
          {playerCount !== null && playerFit(game, playerCount) === 'recommended' && (
            <Badge label={`${playerCount}인 추천`} color={c.badgeRecommended} />
          )}
          {/* "아직 안 해봄" 같은 서술 대신 횟수를 그대로 보여준다. 0회가 곧 그 뜻이다. */}
          <Badge
            label={`플레이 ${game.playCount}회`}
            color={game.playCount === 0 ? c.badgeNew : c.badgeEstimated}
          />
          {game.isEstimated && <Badge label="추정값 포함" color={c.badgeEstimated} />}
        </View>

        <Row label="인원" value={describePlayers(game)} />
        <Row label="플레이타임" value={playtimeLabel(game.minPlaytime, game.maxPlaytime)} />
        <Row
          label="난이도"
          value={game.weight === null ? '미상' : `${weightLabel(game.weight)} (${game.weight})`}
        />
        <Row label="카테고리" value={game.categories.join(' · ') || '없음'} />
        <Row label="테마" value={game.themes.join(' · ') || '없음'} />
        <Row label="메커니즘" value={game.mechanics.join(' · ') || '없음'} />
        {game.yearPublished !== null && <Row label="출시" value={`${game.yearPublished}년`} />}
        <Row label="마지막 플레이" value={game.lastPlayedAt ?? '기록 없음'} />
        {record.bestScore && <Row label="최고 기록" value={record.bestScore} />}
        {record.winners && <Row label="승자" value={record.winners} />}

        {/* 룰 영상 — 유튜브로 연다. 임베드보다 유튜브 앱이 전체화면·배속·이어보기가 낫다. */}
        {game.ruleVideoUrl && (
          <Pressable
            onPress={() => void openBrowserAsync(game.ruleVideoUrl as string)}
            accessibilityRole="button"
            style={[styles.videoButton, { borderColor: c.accent }]}>
            <Text style={[styles.body, { color: c.accent, fontWeight: '600' }]}>
              ▶️ 룰 영상 보기
            </Text>
          </Pressable>
        )}

        {recentPlays.length > 0 && (
          <View style={styles.recentBlock}>
            <View style={styles.recentHeader}>
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>최근 플레이</Text>
              {gamePlays.length > 3 && (
                <Pressable
                  onPress={() => setHistoryOpen(true)}
                  accessibilityRole="button"
                  style={styles.recentMore}>
                  <Text style={[styles.caption, { color: c.accent, fontWeight: '600' }]}>
                    전적 {gamePlays.length}판 모두 보기 ›
                  </Text>
                </Pressable>
              )}
            </View>
            {recentPlays.map((play) => (
              <View
                key={play.id}
                style={[styles.recentRow, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                {/* slice(0,10)는 UTC 날짜다 — 새벽에 끝난 판이 전날로 보인다. 로컬로 변환한다. */}
                <Text style={[styles.caption, { color: c.textSecondary }]}>
                  {play.endedAt ? localDateOf(play.endedAt) : ''}
                </Text>
                <Text style={[styles.body, { color: c.text }]} numberOfLines={2}>
                  {play.rounds.length
                    ? play.rounds.map((r) => roundLabel(r, session.members)).join(' → ')
                    : '라운드 기록 없음'}
                </Text>
                {play.memo && (
                  <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={2}>
                    {play.memo}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {game.description && (
          <Text style={[styles.body, { color: c.textSecondary }]}>{game.description}</Text>
        )}

        {game.isEstimated && (
          <Text style={[styles.caption, { color: c.badgeEstimated }]}>
            노션에 값이 없어 채워 넣은 항목: {game.estimatedFields.map((f) => FIELD_LABEL[f] ?? f).join(', ')}
          </Text>
        )}

        {session.actionError && (
          <Text style={[styles.caption, { color: c.danger }]}>{session.actionError}</Text>
        )}
      </ScrollView>

      <View style={styles.actions}>
        {onEdit && (
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            style={[styles.actionButton, styles.editButton, { borderColor: c.border }]}>
            <Text style={[styles.buttonText, { color: c.text }]}>수정</Text>
          </Pressable>
        )}

        {isActive ? (
          <Pressable
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            style={[styles.actionButton, styles.primaryButton, { backgroundColor: c.accent }]}>
            <Text style={[styles.buttonText, { color: c.onAccent }]}>기록하기 · 종료</Text>
          </Pressable>
        ) : canStart ? (
          <Pressable
            onPress={() => void startGame()}
            disabled={session.pending}
            accessibilityRole="button"
            style={[
              styles.actionButton,
              styles.primaryButton,
              { backgroundColor: c.accent, opacity: session.pending ? 0.5 : 1 },
            ]}>
            <Text style={[styles.buttonText, { color: c.onAccent }]}>
              {session.pending ? '시작하는 중…' : `${session.memberIds.length}명이서 게임 시작`}
            </Text>
          </Pressable>
        ) : otherGameActive && game.owned ? (
          <View style={[styles.actionButton, styles.primaryButton, styles.disabledButton, { borderColor: c.border }]}>
            <Text style={[styles.buttonText, { color: c.textSecondary }]}>다른 게임 기록 중</Text>
          </View>
        ) : game.owned ? (
          // 세션이 없을 때의 빠른 기록 — 예전에 한 판을 뒤늦게 남길 때도 쓴다.
          // 라운드 없는 plays 행이 생기므로 횟수에 바로 잡힌다.
          <Pressable
            onPress={() => void session.quickLog(game.id)}
            disabled={session.pending}
            accessibilityRole="button"
            style={[
              styles.actionButton,
              styles.primaryButton,
              { backgroundColor: c.accent, opacity: session.pending ? 0.5 : 1 },
            ]}>
            <Text style={[styles.buttonText, { color: c.onAccent }]}>
              {session.pending ? '기록하는 중…' : '오늘 이거 했어요'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <PlaySheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />

      {/* 이 게임의 전체 전적 */}
      <Modal visible={historyOpen} animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.background }}>
          <View style={[styles.header, styles.modalHeader, { borderBottomColor: c.border }]}>
            <View style={styles.headerText}>
              <Text style={[styles.caption, { color: c.accent }]}>전적 {gamePlays.length}판</Text>
              <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
                {game.titleKo}
              </Text>
            </View>
            <Pressable onPress={() => setHistoryOpen(false)} accessibilityRole="button" style={styles.close}>
              <Text style={[styles.title, { color: c.textSecondary }]}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {gamePlays.map((play) => (
              <View
                key={play.id}
                style={[styles.recentRow, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                <Text style={[styles.caption, { color: c.textSecondary }]}>
                  {play.endedAt ? localDateOf(play.endedAt) : ''}
                </Text>
                <Text style={[styles.body, { color: c.text }]}>
                  {play.rounds.length
                    ? play.rounds.map((r) => roundLabel(r, session.members)).join(' → ')
                    : '라운드 기록 없음'}
                </Text>
                {Object.keys(play.scores).length > 0 && (
                  <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={1}>
                    점수:{' '}
                    {Object.entries(play.scores)
                      .sort((a, b) => b[1] - a[1])
                      .map(([id, v]) => `${session.members.find((m) => m.id === id)?.name ?? '?'} ${v}`)
                      .join(' · ')}
                  </Text>
                )}
                {play.memo && (
                  <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={2}>
                    “{play.memo}”
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/** '가능 3~6인 · 추천 4,5인 · 베스트 5인' — 노션의 3단계 구분을 그대로 보여준다. */
function describePlayers(game: Game): string {
  if (!game.playerCounts.length) return '정보 없음';
  const parts = [`가능 ${game.playerCounts.join(', ')}인${game.supports10Plus ? ' 이상' : ''}`];
  if (game.recommendedCounts.length) parts.push(`추천 ${game.recommendedCounts.join(', ')}인`);
  if (game.bestCount !== null) parts.push(`베스트 ${game.bestCount}인`);
  return parts.join(' · ');
}

function Row({ label, value }: { label: string; value: string }) {
  const c = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  headerText: { flex: 1, gap: Spacing.one },
  close: { minWidth: TouchTarget.min, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
  title: { ...Typography.title },
  body: { ...Typography.body },
  caption: { ...Typography.caption },
  sectionLabel: { ...Typography.label },
  cover: { width: '100%', aspectRatio: 1, borderRadius: Radius.md },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.three },
  rowLabel: { ...Typography.caption, width: 96 },
  rowValue: { ...Typography.body, flex: 1 },
  videoButton: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  recentBlock: { gap: Spacing.two, marginTop: Spacing.two },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentMore: { minHeight: TouchTarget.min, justifyContent: 'center' },
  modalHeader: { padding: Spacing.four, borderBottomWidth: StyleSheet.hairlineWidth },
  modalContent: {
    padding: Spacing.four,
    gap: Spacing.two,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  recentRow: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  actions: { flexDirection: 'row', gap: Spacing.three, margin: Spacing.four },
  actionButton: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
  },
  editButton: { borderWidth: 1 },
  primaryButton: { flex: 1 },
  disabledButton: { borderWidth: 1 },
  buttonText: { ...Typography.body, fontWeight: '600' },
});
