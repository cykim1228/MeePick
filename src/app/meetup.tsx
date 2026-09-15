import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BackHeader, DETAIL_MAX_WIDTH } from '@/components/back-header';
import { CenterModal } from '@/components/center-modal';
import { GameDetail } from '@/components/game-detail';
import { Icon } from '@/components/icon';
import { MemberGate } from '@/components/member-gate';
import { PostGrid } from '@/components/profile-parts';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { setPostDraft } from '@/features/community/draft';
import { useFeed, useMeetups, useMyProfile } from '@/features/community/hooks';
import {
  playMinutes,
  playOutcome,
  playsOfMeetup,
  postsOfMeetup,
} from '@/features/community/meetup-plays';
import { openPost, useOpenMember, useOpenProfile } from '@/features/community/navigation';
import { RSVP_LABEL, type RsvpStatus } from '@/features/community/types';
import { useGames } from '@/features/games/hooks';
import { storageImageUrl } from '@/features/games/images';
import type { Game } from '@/features/games/types';
import { usePlayHistory, useSession } from '@/features/plays/hooks';
import type { PlayWithGame } from '@/features/plays/queries';
import { computeStandings } from '@/features/plays/stats';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { dDay, formatMeetupTime, localDateOf, localToday } from '@/lib/dates';

const STATUSES: RsvpStatus[] = ['going', 'maybe', 'no'];

/** 120분 → '2시간', 95분 → '1시간 35분'. */
function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/**
 * 모임 하나 — `/meetup?id=<일정 id>`.
 *
 * 일정 카드는 "언제·어디서·누가"까지만 담는다. 모임이 끝나고 궁금한 건 "그날 뭐 했더라"다 —
 * 판 기록에도 글에도 일정이 이미 적혀 있는데 모아 보는 곳이 없었다. 여기서 한 번에 본다.
 *
 * 다가오는 모임이면 참석 응답을, 지난 모임이면 그날 한 게임과 사진을 앞에 둔다.
 */
export default function MeetupScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  // 모임이 바뀌면 화면 상태(열어 둔 게임 창)를 새로 시작한다 — 탭 화면은 살아 있다.
  return <MeetupView key={id} id={id} />;
}

function MeetupView({ id }: { id: string }) {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const list = useMeetups(me.isMember);
  const feed = useFeed(me.isMember);
  const { plays } = usePlayHistory();
  const { members } = useSession();
  const { all: games } = useGames();
  const openProfile = useOpenProfile();
  const openMember = useOpenMember();
  const [openGame, setOpenGame] = useState<Game | null>(null);

  const meetup = list.meetups.find((m) => m.id === id) ?? null;
  const dayPlays = useMemo(
    () => (meetup ? playsOfMeetup(meetup, list.meetups, plays) : []),
    [meetup, list.meetups, plays]
  );
  const posts = useMemo(
    () => (meetup ? postsOfMeetup(meetup, feed.posts) : []),
    [meetup, feed.posts]
  );
  const standings = useMemo(
    () =>
      computeStandings(dayPlays, members)
        .filter((s) => s.roundWins > 0)
        .slice(0, 3),
    [dayPlays, members]
  );
  const minutes = dayPlays.reduce((sum, p) => sum + playMinutes(p), 0);

  const screen = [styles.screen, { backgroundColor: c.background, paddingTop: insets.top }];
  const header = <BackHeader title={meetup?.title ?? '모임'} fallback="/meetups" />;

  if (me.loading || (me.isMember && list.loading)) {
    return (
      <View style={screen}>
        {header}
        <LoadingView />
      </View>
    );
  }

  if (!me.isMember) {
    return (
      <View style={screen}>
        {header}
        <MemberGate />
      </View>
    );
  }

  if (!meetup) {
    return (
      <View style={screen}>
        {header}
        {list.error ? (
          <ErrorView message={list.error} onRetry={() => void list.reload()} />
        ) : (
          <EmptyView title="일정을 찾을 수 없어요" hint="지워진 일정일 수 있어요." />
        )}
      </View>
    );
  }

  const past = meetup.isPast;
  const today = localDateOf(meetup.startsAt) === localToday();
  const showPlays = past || today;
  const going = meetup.rsvps.filter((r) => r.status === 'going');
  const maybe = meetup.rsvps.filter((r) => r.status === 'maybe');
  const no = meetup.rsvps.filter((r) => r.status === 'no');

  /**
   * 후기 초안 — 모임 마무리 리캡과 같은 방식이다. 그날 뭘 했고 누가 이겼는지는 앱이 이미 안다.
   * 첫 줄을 앱이 써 두고, 사진과 한 줄 감상만 사람에게 남긴다.
   */
  const writeRecap = () => {
    const lines: string[] = [meetup.title];
    if (dayPlays.length > 0) {
      const titles = [...new Set(dayPlays.map((p) => p.gameTitle))];
      lines.push(`${dayPlays.length}판 — ${titles.join(', ')}`);
    }
    if (standings.length > 0) {
      lines.push(
        standings
          .map((s, i) => `${i === 0 ? '🏆 ' : ''}${s.member.name} ${s.roundWins}승`)
          .join(' · ')
      );
    }
    setPostDraft({
      body: `${lines.join('\n')}\n\n`,
      meetupId: meetup.id,
      meetupTitle: meetup.title,
    });
    router.push('/feed');
  };

  return (
    <View style={screen}>
      {header}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}>
        {/* 언제·어디서 */}
        <View style={styles.info}>
          <View style={styles.whenRow}>
            <View
              style={[styles.dday, { backgroundColor: past ? c.backgroundSelected : c.accent }]}>
              <Text
                style={[t.caption, styles.bold, { color: past ? c.textSecondary : c.onAccent }]}>
                {dDay(meetup.startsAt)}
              </Text>
            </View>
            <Text style={[t.body, { color: c.text }]}>{formatMeetupTime(meetup.startsAt)}</Text>
          </View>
          <Text style={[t.title, { color: c.text }]}>{meetup.title}</Text>
          {!!meetup.place && (
            <Text style={[t.body, { color: c.textSecondary }]}>{meetup.place}</Text>
          )}
          {!!meetup.memo && <Text style={[t.body, { color: c.text }]}>{meetup.memo}</Text>}
        </View>

        {/* 누가 */}
        <Text style={[t.label, styles.section, { color: c.textSecondary }]}>
          {past ? '온다고 한 사람' : '참석'} {going.length}
          {meetup.capacity !== null ? `/${meetup.capacity}` : ''}명
        </Text>
        {going.length === 0 ? (
          <Text style={[t.caption, { color: c.textSecondary }]}>
            아직 참석한다는 사람이 없어요.
          </Text>
        ) : (
          <View style={styles.people}>
            {going.map((r) => (
              <Pressable
                key={r.profile.id}
                onPress={() => openProfile(r.profile.id)}
                accessibilityRole="button"
                accessibilityLabel={`${r.profile.displayName} 프로필`}
                style={({ pressed }) => [styles.person, pressed && styles.pressed]}>
                <Avatar profile={r.profile} size={40} />
                <Text style={[t.caption, styles.personName, { color: c.text }]} numberOfLines={1}>
                  {r.profile.displayName}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {(maybe.length > 0 || no.length > 0) && (
          <Text style={[t.caption, { color: c.textSecondary }]}>
            {maybe.length > 0 ? `아마도 ${maybe.map((r) => r.profile.displayName).join(', ')}` : ''}
            {maybe.length > 0 && no.length > 0 ? ' · ' : ''}
            {no.length > 0 ? `못 가요 ${no.map((r) => r.profile.displayName).join(', ')}` : ''}
          </Text>
        )}

        {!past && (
          <View style={styles.rsvpRow}>
            {STATUSES.map((s) => {
              const on = meetup.myStatus === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => void list.rsvp(meetup.id, s)}
                  disabled={list.pending}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.rsvp,
                    {
                      backgroundColor: on ? c.accent : 'transparent',
                      borderColor: on ? c.accent : c.border,
                    },
                  ]}>
                  <Text style={[t.body, styles.bold, { color: on ? c.onAccent : c.textSecondary }]}>
                    {RSVP_LABEL[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* 무엇을 했나 */}
        {showPlays && (
          <>
            <Text style={[t.label, styles.section, { color: c.textSecondary }]}>이날 한 게임</Text>
            {dayPlays.length === 0 ? (
              <Text style={[t.caption, { color: c.textSecondary }]}>남은 판 기록이 없어요.</Text>
            ) : (
              <View
                style={[
                  styles.playsCard,
                  { backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}>
                <Text style={[t.subtitle, { color: c.text }]}>
                  {dayPlays.length}판{minutes > 0 ? ` · 총 ${formatMinutes(minutes)}` : ''}
                </Text>
                {standings.length > 0 && (
                  <Text style={[t.body, { color: c.text }]}>
                    {standings.map((s, i) => (
                      <Text key={s.member.id}>
                        {i > 0 ? ' · ' : ''}
                        {i === 0 ? '🏆 ' : ''}
                        <Text
                          onPress={() => openMember(s.member)}
                          accessibilityRole="link"
                          style={styles.bold}>
                          {s.member.name}
                        </Text>
                        {` ${s.roundWins}승`}
                      </Text>
                    ))}
                  </Text>
                )}
                <View style={styles.playList}>
                  {dayPlays.map((p) => (
                    <PlayRow
                      key={p.id}
                      play={p}
                      members={members}
                      game={games.find((g) => g.id === p.gameId) ?? null}
                      onOpenGame={setOpenGame}
                      onOpenMember={openMember}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* 사진·글 */}
        <Text style={[t.label, styles.section, { color: c.textSecondary }]}>사진 · 글</Text>
        <PostGrid
          posts={posts}
          emptyText={
            showPlays
              ? '이 모임이 달린 글이 아직 없어요.'
              : '모임이 끝나면 사진과 후기를 남겨 보세요.'
          }
          onOpen={(p) => openPost(p.id)}
        />
        {showPlays && (
          <Pressable
            onPress={writeRecap}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.recapButton,
              { borderColor: c.accent },
              pressed && styles.pressed,
            ]}>
            <Icon name="plus" size={16} color={c.accent} />
            <Text style={[t.body, styles.bold, { color: c.accent }]}>
              {posts.length > 0 ? '이 모임 글 더 쓰기' : '후기 남기기'}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <CenterModal visible={!!openGame} onClose={() => setOpenGame(null)}>
        {openGame && (
          <GameDetail game={openGame} playerCount={null} onClose={() => setOpenGame(null)} />
        )}
      </CenterModal>
    </View>
  );
}

/** 판 한 줄 — 표지, 게임, 누가 이겼나, 걸린 시간. 누르면 게임 상세. */
function PlayRow({
  play,
  members,
  game,
  onOpenGame,
  onOpenMember,
}: {
  play: PlayWithGame;
  members: Member[];
  game: Game | null;
  onOpenGame: (game: Game) => void;
  onOpenMember: (member: Member) => void;
}) {
  const c = useTheme();
  const t = useType();
  const outcome = playOutcome(play, members);
  const cover = play.gameImagePath ? storageImageUrl(play.gameImagePath) : null;
  const min = playMinutes(play);

  // 줄 안의 이름을 누르면 줄 전체(게임 상세)까지 눌리지 않게 막는다.
  const openMember = (e: GestureResponderEvent, member: Member) => {
    e.stopPropagation();
    onOpenMember(member);
  };

  return (
    <Pressable
      onPress={() => game && onOpenGame(game)}
      disabled={!game}
      accessibilityRole="button"
      accessibilityLabel={`${play.gameTitle} 게임 보기`}
      style={({ pressed }) => [styles.playRow, pressed && styles.pressed]}>
      <View style={[styles.thumb, { backgroundColor: c.backgroundSelected }]}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Icon name="dice" size={18} color={c.textSecondary} />
        )}
      </View>
      <View style={styles.playText}>
        <Text style={[t.body, styles.bold, { color: c.text }]} numberOfLines={1}>
          {play.gameTitle}
        </Text>
        <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={1}>
          {outcome === null
            ? '라운드 기록 없음'
            : outcome.kind === 'coop'
              ? `협동 ${outcome.wins}승 ${outcome.losses}패`
              : outcome.winners.length === 0
                ? '승자 기록 없음'
                : outcome.winners.map((w, i) => (
                    <Text key={w.member.id}>
                      {i > 0 ? ' · ' : ''}
                      <Text
                        onPress={(e) => openMember(e, w.member)}
                        accessibilityRole="link"
                        style={[styles.bold, { color: c.text }]}>
                        {w.member.name}
                      </Text>
                      {` ${w.wins}승`}
                    </Text>
                  ))}
          {min > 0 ? ` · ${min}분` : ''}
        </Text>
      </View>
      {game && <Icon name="chevronRight" size={16} color={c.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: DETAIL_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  info: { gap: Spacing.one },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  dday: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.full },
  bold: { fontWeight: '700' },
  section: { marginTop: Spacing.two },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  person: { alignItems: 'center', gap: 4, width: 56 },
  personName: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
  rsvpRow: { flexDirection: 'row', gap: Spacing.two },
  rsvp: {
    flex: 1,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  playsCard: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  playList: { gap: 0 },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget.primary,
    paddingVertical: Spacing.one,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { flex: 1, minWidth: 0, gap: 1 },
  recapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: TouchTarget.min,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    alignSelf: 'flex-start',
  },
});
