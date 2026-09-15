import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ScreenTitle } from '@/components/screen-title';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useOpenMember } from '@/features/community/navigation';
import { usePlayHistory, useSession } from '@/features/plays/hooks';
import {
  computeBestScores,
  computeMonthly,
  computeStandings,
  computeStreaks,
  computeTopGames,
  type TopGame,
} from '@/features/plays/stats';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';
import { localDateOf } from '@/lib/dates';

const MEDALS = ['🥇', '🥈', '🥉'];

type Segment = 'wins' | 'scores' | 'stats';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'wins', label: '우승 순위' },
  { key: 'scores', label: '개인 점수' },
  { key: 'stats', label: '통계' },
];

/**
 * 명예의 전당 — 우승 순위 / 개인 점수 / 통계.
 * 탭을 더 늘리지 않고 세그먼트로 묶는다. 하단 탭 5개가 모바일 한계선이다.
 */
export default function HallOfFameScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { members } = useSession();
  const { plays, loading, error, reload } = usePlayHistory();
  const [segment, setSegment] = useState<Segment>('wins');
  // 순위의 사람을 누르면 그 사람 프로필로 간다. 손님은 전적만 있는 프로필로.
  const openMember = useOpenMember();

  const standings = useMemo(() => computeStandings(plays, members), [plays, members]);
  const streaks = useMemo(() => computeStreaks(plays, members), [plays, members]);
  const bestScores = useMemo(() => computeBestScores(plays, members), [plays, members]);
  const monthly = useMemo(() => computeMonthly(plays), [plays]);
  const topGames = useMemo(() => computeTopGames(plays, members), [plays, members]);

  // 월간 리포트 — 월 막대를 누르면 그 달의 순위·게임을 펼친다.
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const monthPlays = useMemo(
    () =>
      openMonth
        ? plays.filter((p) => p.endedAt && localDateOf(p.endedAt).startsWith(openMonth))
        : [],
    [plays, openMonth]
  );
  const monthStandings = useMemo(
    () => computeStandings(monthPlays, members).filter((s) => s.roundWins > 0).slice(0, 5),
    [monthPlays, members]
  );
  const monthGames = useMemo(() => computeTopGames(monthPlays, members, 3), [monthPlays, members]);

  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <ErrorView message={error} onRetry={() => void reload()} />
      </View>
    );
  }
  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <LoadingView />
      </View>
    );
  }

  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count));
  const anyWins = standings.some((s) => s.roundWins > 0);

  return (
    <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}>
        <ScreenTitle title="명예의 전당" subtitle={`지금까지 ${plays.length}판`} />

        <View style={styles.chipRow}>
          {SEGMENTS.map((s) => (
            <Chip key={s.key} label={s.label} selected={segment === s.key} onPress={() => setSegment(s.key)} />
          ))}
        </View>

        {/* ── 우승 순위 ── */}
        {segment === 'wins' && (
          <>
            <Text style={[styles.sub, { color: c.textSecondary }]}>
              라운드 우승 횟수예요. 공동 우승과 협동 승리도 각자 1승으로 칩니다.
            </Text>
            {!anyWins && (
              <EmptyView title="아직 우승 기록이 없어요" hint="라운드 우승자를 기록하면 순위가 생깁니다." />
            )}
            {anyWins &&
              standings.map((item, index) => {
                const top3 = index < 3 && item.roundWins > 0;
                return (
                  <Pressable
                    key={item.member.id}
                    onPress={() => openMember(item.member)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.member.name} 프로필`}
                    style={({ pressed }) => [
                      styles.row,
                      top3 ? styles.rowTop : null,
                      {
                        backgroundColor: c.backgroundElement,
                        borderColor: index === 0 && item.roundWins > 0 ? c.accent : c.border,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[top3 ? styles.medal : styles.rank, { color: c.textSecondary }]}>
                      {top3 ? MEDALS[index] : `${index + 1}`}
                    </Text>
                    <View style={styles.rowBody}>
                      <Text style={[top3 ? styles.nameTop : styles.name, { color: c.text }]} numberOfLines={1}>
                        {item.member.name}
                        {(streaks.get(item.member.id)?.current ?? 0) >= 2 && (
                          <Text style={{ color: c.accent }}>
                            {'  '}🔥 {streaks.get(item.member.id)?.current}연승 중
                          </Text>
                        )}
                      </Text>
                      <Text style={[styles.caption, { color: c.textSecondary }]}>
                        {item.playCount}판 참여
                        {item.roundsPlayed > 0
                          ? ` · 승률 ${Math.round((item.roundWins / item.roundsPlayed) * 100)}% (${item.roundsPlayed}라운드)`
                          : ''}
                        {item.coopWins > 0 ? ` · 협동 ${item.coopWins}승 포함` : ''}
                        {(streaks.get(item.member.id)?.best ?? 0) >= 3
                          ? ` · 최고 ${streaks.get(item.member.id)?.best}연승`
                          : ''}
                      </Text>
                    </View>
                    <Text style={[top3 ? styles.winsTop : styles.wins, { color: top3 ? c.accent : c.text }]}>
                      {item.roundWins}승
                    </Text>
                  </Pressable>
                );
              })}
          </>
        )}

        {/* ── 개인 점수 ── */}
        {segment === 'scores' && (
          <>
            <Text style={[styles.sub, { color: c.textSecondary }]}>
              각자의 최고 점수예요. 라운드를 기록할 때 점수를 적으면 갱신됩니다.
            </Text>
            {bestScores.length === 0 && (
              <EmptyView
                title="아직 점수 기록이 없어요"
                hint="게임중 화면의 '이번 라운드 점수' 칸에 점수를 남겨보세요."
              />
            )}
            {bestScores.map((item, index) => (
              <Pressable
                key={item.member.id}
                onPress={() => openMember(item.member)}
                accessibilityRole="button"
                accessibilityLabel={`${item.member.name} 프로필`}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: c.backgroundElement, borderColor: index === 0 ? c.accent : c.border },
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.rank, { color: c.textSecondary }]}>{index + 1}</Text>
                <View style={styles.rowBody}>
                  <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                    {item.member.name}
                  </Text>
                  <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={1}>
                    {item.gameTitle} · {item.date}
                  </Text>
                </View>
                <Text style={[styles.wins, { color: index === 0 ? c.accent : c.text }]}>
                  {item.score}점
                </Text>
              </Pressable>
            ))}
          </>
        )}

        {/* ── 통계 ── */}
        {segment === 'stats' && (
          <>
            {plays.length === 0 && (
              <EmptyView title="아직 기록이 없어요" hint="판이 쌓이면 통계가 생깁니다." />
            )}

            {monthly.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
                  월별 플레이 — 누르면 그 달 리포트
                </Text>
                {monthly.map((m) => (
                  <View key={m.month}>
                    <Pressable
                      onPress={() => setOpenMonth((cur) => (cur === m.month ? null : m.month))}
                      accessibilityRole="button"
                      style={styles.barRow}>
                      <Text
                        style={[
                          styles.caption,
                          { color: openMonth === m.month ? c.accent : c.textSecondary, width: 64 },
                        ]}>
                        {m.month}
                      </Text>
                      <View style={[styles.barTrack, { backgroundColor: c.backgroundSelected }]}>
                        <View
                          style={[
                            styles.barFill,
                            { backgroundColor: c.accent, width: `${(m.count / maxMonthly) * 100}%` },
                          ]}
                        />
                      </View>
                      <Text style={[styles.caption, { color: c.text, width: 44, textAlign: 'right' }]}>
                        {m.count}판
                      </Text>
                    </Pressable>

                    {openMonth === m.month && (
                      <View
                        style={[
                          styles.monthDetail,
                          { backgroundColor: c.backgroundElement, borderColor: c.border },
                        ]}>
                        {monthStandings.length > 0 ? (
                          <Text style={[styles.body, { color: c.text }]}>
                            {monthStandings.map((s, i) => (
                              <Text key={s.member.id}>
                                {i > 0 ? ' · ' : ''}
                                {i === 0 ? '🏆 ' : ''}
                                <Text
                                  onPress={() => openMember(s.member)}
                                  accessibilityRole="link"
                                  style={styles.nameLink}>
                                  {s.member.name}
                                </Text>
                                {` ${s.roundWins}승`}
                              </Text>
                            ))}
                          </Text>
                        ) : (
                          <Text style={[styles.caption, { color: c.textSecondary }]}>
                            이 달은 우승 기록이 없어요.
                          </Text>
                        )}
                        {monthGames.map((g) => (
                          <Text key={g.title} style={[styles.caption, { color: c.textSecondary }]} numberOfLines={1}>
                            {g.title} {g.count}판
                            {g.topWinner && (
                              <>
                                {' · 최다 우승 '}
                                <WinnerLink winner={g.topWinner} onOpen={openMember} />
                              </>
                            )}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            {topGames.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>많이 한 게임</Text>
                {topGames.map((g, index) => (
                  <View
                    key={g.title}
                    style={[styles.row, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                    <Text style={[styles.rank, { color: c.textSecondary }]}>{index + 1}</Text>
                    <View style={styles.rowBody}>
                      <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                        {g.title}
                      </Text>
                      {g.topWinner && (
                        <Text style={[styles.caption, { color: c.textSecondary }]}>
                          {'최다 우승 '}
                          <WinnerLink winner={g.topWinner} onOpen={openMember} />
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.wins, { color: c.text }]}>{g.count}판</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** '민수 3승' — 이름 부분만 눌린다. 글 줄 속에 끼는 링크라 줄 전체를 버튼으로 만들지 않는다. */
function WinnerLink({
  winner,
  onOpen,
}: {
  winner: NonNullable<TopGame['topWinner']>;
  onOpen: (member: Member) => void;
}) {
  const c = useTheme();
  return (
    <Text>
      <Text
        onPress={() => onOpen(winner.member)}
        accessibilityRole="link"
        style={[styles.nameLink, { color: c.text }]}>
        {winner.member.name}
      </Text>
      {` ${winner.wins}승`}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two, maxWidth: 720, width: '100%', alignSelf: 'center' },
  h1: { ...Typography.display },
  sub: { ...Typography.body, marginBottom: Spacing.two },
  sectionLabel: { ...Typography.label, marginTop: Spacing.three },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginVertical: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  rowTop: { paddingVertical: Spacing.four },
  medal: { fontSize: 28, width: 40, textAlign: 'center' },
  rank: { ...Typography.subtitle, width: 40, textAlign: 'center' },
  rowBody: { flex: 1, gap: 2 },
  nameTop: { ...Typography.title },
  name: { ...Typography.body, fontWeight: '600' },
  winsTop: { ...Typography.title },
  wins: { ...Typography.subtitle },
  caption: { ...Typography.caption },
  body: { ...Typography.body },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 36 },
  monthDetail: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  barTrack: { flex: 1, height: 14, borderRadius: Radius.full, overflow: 'hidden' },
  pressed: { opacity: 0.7 },
  nameLink: { fontWeight: '700' },
  barFill: { height: '100%', borderRadius: Radius.full },
});
