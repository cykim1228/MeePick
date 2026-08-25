import { Image } from 'expo-image';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/chip';
import { Icon } from '@/components/icon';
import { PlaySheet, roundLabel } from '@/components/play-sheet';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { gameImageUrl } from '@/features/games/images';
import { playerFit, playtimeLabel, weightLabel } from '@/features/games/recommend';
import type { Game } from '@/features/games/types';
import { useMyProfile } from '@/features/community/hooks';
import { useGameLikes } from '@/features/games/likes';
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
  const likes = useGameLikes();
  const isMember = useMyProfile().isMember;
  const liked = likes.mine(game.id);
  const likeCount = likes.count(game.id);

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

  // 전적 — 판·라운드 수, 승자 분포, 최고 점수, 평균 소요 시간.
  const record = useMemo(() => {
    let best: { score: number; memberId: string; date: string } | null = null;
    const wins = new Map<string, number>();
    let rounds = 0;
    let durationSum = 0;
    let durationCount = 0;
    for (const play of gamePlays) {
      rounds += play.rounds.length;
      if (play.endedAt) {
        const min = Math.round(
          (new Date(play.endedAt).getTime() - new Date(play.startedAt).getTime()) / 60000
        );
        // 빠른 기록(시작=종료)과 켜 둔 채 잊은 판은 평균을 망가뜨린다. 상식 범위만 센다.
        if (min >= 1 && min <= 720) {
          durationSum += min;
          durationCount += 1;
        }
      }
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
    const ranking = [...wins.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => ({ name: name(id), wins: n }));
    return {
      plays: gamePlays.length,
      rounds,
      ranking,
      avgMinutes: durationCount ? Math.round(durationSum / durationCount) : null,
      bestScore: best ? `${best.score}점 · ${name(best.memberId)} (${best.date})` : null,
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
          {/* 하트는 제목 옆 — 이 게임을 하고 싶은지는 스펙보다 먼저 말하고 싶은 것이다.
              비회원에게는 누른 사람 수만 보여 준다. */}
          {isMember ? (
            <Pressable
              onPress={() => void likes.toggle(game.id)}
              accessibilityRole="button"
              accessibilityLabel={liked ? '하트 취소' : '하트'}
              hitSlop={8}
              style={[styles.likeButton, { borderColor: liked ? c.danger : c.border }]}>
              <Icon name="heart" size={18} color={liked ? c.danger : c.textSecondary} filled={liked} />
              {likeCount > 0 && (
                <Text style={[styles.caption, { color: liked ? c.danger : c.textSecondary, fontWeight: '700' }]}>
                  {likeCount}
                </Text>
              )}
            </Pressable>
          ) : (
            likeCount > 0 && (
              <View style={[styles.likeButton, { borderColor: c.border }]}>
                <Icon name="heart" size={18} color={c.textSecondary} />
                <Text style={[styles.caption, { color: c.textSecondary, fontWeight: '700' }]}>
                  {likeCount}
                </Text>
              </View>
            )
          )}
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

        {game.playerCounts.length ? (
          <TagRow label="인원">
            {game.playerCounts.map((n) => {
              const best = game.bestCount === n;
              const rec = !best && game.recommendedCounts.includes(n);
              const plus =
                game.supports10Plus && n === game.playerCounts[game.playerCounts.length - 1];
              return (
                <Badge
                  key={n}
                  label={`${n}인${plus ? '+' : ''}${best ? ' 베스트' : rec ? ' 추천' : ''}`}
                  color={best ? c.badgeBest : rec ? c.badgeRecommended : c.badgeEstimated}
                />
              );
            })}
          </TagRow>
        ) : (
          <Row label="인원" value="정보 없음" />
        )}
        {game.minPlaytime === null && game.maxPlaytime === null ? (
          <Row label="플레이타임" value="시간 미상" />
        ) : (
          <TagRow label="플레이타임">
            <Badge label={playtimeLabel(game.minPlaytime, game.maxPlaytime)} color={c.tagTime} />
          </TagRow>
        )}
        {game.weight === null ? (
          <Row label="난이도" value="미상" />
        ) : (
          <TagRow label="난이도">
            <Badge label={`${weightLabel(game.weight)} (${game.weight})`} color={c.tagWeight} />
          </TagRow>
        )}
        {game.categories.length ? (
          <TagRow label="카테고리">
            {game.categories.map((v) => (
              <Badge key={v} label={v} color={c.accent} />
            ))}
          </TagRow>
        ) : (
          <Row label="카테고리" value="없음" />
        )}
        {game.themes.length ? (
          <TagRow label="테마">
            {game.themes.map((v) => (
              <Badge key={v} label={v} color={c.tagTheme} />
            ))}
          </TagRow>
        ) : (
          <Row label="테마" value="없음" />
        )}
        {game.mechanics.length ? (
          <TagRow label="메커니즘">
            {game.mechanics.map((v) => (
              // 노션 값이 '한글명 (English Name)' 형태다. 영문명은 규칙 검색·BGG 조회에 쓰이므로
              // 잘라내지 않고 그대로 둔다 — 알약이 길어지면 줄바꿈으로 흘러간다.
              <Badge key={v} label={v} color={c.tagMechanic} />
            ))}
          </TagRow>
        ) : (
          <Row label="메커니즘" value="없음" />
        )}
        {game.yearPublished !== null && <Row label="출시" value={`${game.yearPublished}년`} />}
        <Row label="마지막 플레이" value={game.lastPlayedAt ?? '기록 없음'} />

        {/* 전적 — 낱줄로 흩어 두면 스펙 사이에 묻힌다. "우리가 이 게임과 어떻게 지냈나"는
            카탈로그 정보와 성격이 다르므로 한 덩어리로 묶어 눈에 띄게 둔다. */}
        {record.plays > 0 && (
          <View style={[styles.recordBlock, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>전적</Text>
            <View style={styles.recordStats}>
              <Stat label="판" value={`${record.plays}`} color={c.text} sub={c.textSecondary} />
              {record.rounds > 0 && (
                <Stat label="라운드" value={`${record.rounds}`} color={c.text} sub={c.textSecondary} />
              )}
              {record.avgMinutes !== null && (
                <Stat label="평균" value={`${record.avgMinutes}분`} color={c.text} sub={c.textSecondary} />
              )}
            </View>
            {record.ranking.length > 0 && (
              <View style={styles.rankRow}>
                {record.ranking.map((r, i) => (
                  <Badge
                    key={r.name}
                    label={`${i === 0 ? '🏆 ' : ''}${r.name} ${r.wins}승`}
                    color={i === 0 ? c.badgeBest : c.textSecondary}
                  />
                ))}
              </View>
            )}
            {record.bestScore && (
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                최고 점수 {record.bestScore}
              </Text>
            )}
          </View>
        )}

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

function Row({ label, value }: { label: string; value: string }) {
  const c = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

/**
 * 값을 기준별 색 태그로 보여주는 행. 인원은 가능(회색)·추천(파랑)·베스트(초록)를
 * 카드 배지와 같은 색으로 구분하고, 나머지 기준은 theme.ts의 tag* 고정색을 쓴다.
 */
function TagRow({ label, children }: { label: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: c.textSecondary }]}>{label}</Text>
      <View style={styles.tagWrap}>{children}</View>
    </View>
  );
}

/** 전적 숫자 한 칸. 값이 크고 라벨이 작아야 숫자가 먼저 읽힌다. */
function Stat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.caption, { color: sub }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  recordBlock: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recordStats: { flexDirection: 'row', gap: Spacing.five },
  stat: { alignItems: 'flex-start', gap: 2 },
  statValue: { ...Typography.subtitle, fontWeight: '700' },
  rankRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
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
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  rowLabel: { ...Typography.caption, width: 96, paddingTop: Spacing.half },
  rowValue: { ...Typography.body, flex: 1 },
  tagWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
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
