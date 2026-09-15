import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BackHeader, DETAIL_MAX_WIDTH } from '@/components/back-header';
import { CenterModal } from '@/components/center-modal';
import { GameDetail } from '@/components/game-detail';
import { Icon } from '@/components/icon';
import {
  GameGrid,
  PostGrid,
  ProfileStat,
  RecentPlays,
  RecordCard,
} from '@/components/profile-parts';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing } from '@/constants/theme';
import { useFeed, useMyProfile } from '@/features/community/hooks';
import { openHistoryOf, openPost } from '@/features/community/navigation';
import { fetchProfile } from '@/features/community/queries';
import type { Profile } from '@/features/community/types';
import { useGames, useWishlist } from '@/features/games/hooks';
import { useGameLikeStore } from '@/features/games/likes';
import type { Game } from '@/features/games/types';
import { usePlayHistory, useSession } from '@/features/plays/hooks';
import { computeMemberRecord } from '@/features/plays/record';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/**
 * 다른 사람의 프로필 — `/member?id=<계정 id>` 또는 `/member?guest=<멤버 id>`.
 *
 * 피드에서 이름만 봐서는 그 사람이 누구인지, 어떤 게임을 좋아하는지 알 수 없다.
 * 모임에서 "뭐 할까"를 정할 때 쓸모 있는 건 그 사람의 **전적과 하트한 게임**이라 그 둘을 앞에 둔다.
 *
 * 보여 주는 범위가 셋이다.
 *   - 회원이 회원을 볼 때: 전부(전적·최근 판·하트한 게임·게시글)
 *   - 계정 없는 손님: 전적과 최근 판만 — 기록·전당에는 손님도 나오므로 눌렀을 때 막히면 안 된다
 *   - 로그인 안 한 사람: 전적과 최근 판만 — 기록·전당은 원래 공개이고, 글과 하트는 회원끼리 본다
 *
 * 실명은 보여 주지 않는다 — 가입할 때 "누구인지 확인용"으로 받은 값이라,
 * 모임장이 아닌 사람에게까지 드러낼 이유가 없다. 닉네임과 아이디면 충분하다.
 */
export default function MemberScreen() {
  const params = useLocalSearchParams<{ id?: string; guest?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const guest = typeof params.guest === 'string' ? params.guest : '';
  // 사람이 바뀌면 화면 상태를 통째로 새로 시작한다. 탭 화면은 살아 있어서, 그냥 두면
  // 앞 사람에게서 열어 둔 게임 창이나 받아 둔 프로필이 다음 사람 화면에 남는다.
  return <MemberView key={`${id}|${guest}`} profileId={id} guestId={guest} />;
}

function MemberView({ profileId, guestId }: { profileId: string; guestId: string }) {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const session = useSession();
  const { plays } = usePlayHistory();

  // 기록 속 사람. 손님 주소면 멤버 id로, 회원 주소면 계정 id로 찾는다.
  const member = useMemo(
    () =>
      (guestId
        ? session.members.find((m) => m.id === guestId)
        : session.members.find((m) => m.profileId === profileId)) ?? null,
    [session.members, guestId, profileId]
  );
  // 손님 주소로 들어왔어도 그사이 계정과 이어졌으면 회원으로 본다.
  const accountId = profileId || member?.profileId || '';
  /** 글·하트까지 보여 줄 수 있는가 — 보는 사람이 회원이고, 보이는 사람이 계정이 있어야 한다. */
  const community = me.isMember && !!accountId;

  const [fetched, setFetched] = useState<{ profile: Profile | null; error: string | null } | null>(
    null
  );
  const [attempt, setAttempt] = useState(0);
  const [openGame, setOpenGame] = useState<Game | null>(null);

  useEffect(() => {
    if (!community) return;
    let alive = true;
    fetchProfile(accountId)
      .then((profile) => {
        if (alive) setFetched({ profile, error: null });
      })
      .catch((e: unknown) => {
        if (alive) setFetched({ profile: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
    };
  }, [community, accountId, attempt]);

  // 내 프로필을 이 화면으로 열었다면 편집이 되는 '내 프로필'로 돌려보낸다.
  useEffect(() => {
    if (accountId && accountId === me.profile?.id) router.replace('/profile');
  }, [accountId, me.profile?.id]);

  const feed = useFeed(community);
  const posts = useMemo(
    () => (community ? feed.posts.filter((p) => p.author.id === accountId) : []),
    [community, feed.posts, accountId]
  );
  const likesGot = posts.reduce((sum, p) => sum + p.likeCount, 0);

  /**
   * 하트한 게임 — 소장 게임이면 '하고 싶다', 위시 게임이면 '사고 싶다'는 표시다.
   * 둘을 한 격자에 두되 위시 쪽은 표지에 띠를 둘러 구분한다.
   */
  const { all: owned } = useGames();
  const wish = useWishlist();
  const likes = useGameLikeStore();
  const hearted = useMemo(() => {
    if (!community) return [];
    const has = (g: Game) => likes.byGame.get(g.id)?.has(accountId) ?? false;
    return [...owned.filter(has), ...wish.games.filter(has)];
  }, [community, owned, wish.games, likes.byGame, accountId]);

  const record = useMemo(
    () => (member ? computeMemberRecord(plays, member) : null),
    [plays, member]
  );

  const person = fetched?.profile ?? null;
  const name = person?.displayName ?? member?.name ?? '';
  const fallback = guestId ? '/history' : '/feed';
  const screen = [styles.screen, { backgroundColor: c.background, paddingTop: insets.top }];

  if (me.loading || !session.ready || (community && fetched === null)) {
    return (
      <View style={screen}>
        <BackHeader title={name || '프로필'} fallback={fallback} />
        <LoadingView />
      </View>
    );
  }

  if (community && fetched?.error) {
    return (
      <View style={screen}>
        <BackHeader title={name || '프로필'} fallback={fallback} />
        <ErrorView
          message={fetched.error}
          onRetry={() => {
            setFetched(null);
            setAttempt((n) => n + 1);
          }}
        />
      </View>
    );
  }

  if (!person && !member) {
    return (
      <View style={screen}>
        <BackHeader title="프로필" fallback={fallback} />
        <EmptyView title="사람을 찾을 수 없어요" hint="모임을 나갔거나 주소가 잘못됐어요." />
      </View>
    );
  }

  const isGuest = !accountId;

  return (
    <View style={screen}>
      <BackHeader title={name} fallback={fallback} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}>
        <View style={styles.top}>
          <Avatar profile={person ?? { displayName: name, avatarPath: null }} size={84} />
          {person ? (
            <View style={styles.stats}>
              <ProfileStat label="게시글" value={posts.length} />
              <ProfileStat label="받은 좋아요" value={likesGot} />
              <ProfileStat label="하트한 게임" value={hearted.length} />
            </View>
          ) : (
            <View style={styles.nameBlock}>
              <View style={styles.nameRow}>
                <Text style={[t.subtitle, { color: c.text }]}>{name}</Text>
                {isGuest && <Badge label="손님" color={c.textSecondary} />}
              </View>
            </View>
          )}
        </View>

        {person && (
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={[t.subtitle, { color: c.text }]}>{person.displayName}</Text>
              {person.isAdmin && <Badge label="모임장" color={c.accent} />}
            </View>
            <Text style={[t.caption, { color: c.textSecondary }]}>@{person.handle}</Text>
            {!!person.bio && <Text style={[t.body, { color: c.text }]}>{person.bio}</Text>}
          </View>
        )}

        {/* 왜 일부만 보이는지 말한다 — 말이 없으면 "이 사람은 글을 안 쓰나"로 읽힌다. */}
        {!person && (
          <View style={[styles.note, { borderColor: c.border }]}>
            <Icon name={isGuest ? 'user' : 'lock'} size={16} color={c.textSecondary} />
            <Text style={[t.caption, styles.noteText, { color: c.textSecondary }]}>
              {isGuest
                ? '계정 없이 플레이 기록만 있는 손님이에요. 가입하면 모임장이 ‘사용자 관리 → 기록 잇기’로 이 기록을 계정에 이어 줄 수 있어요.'
                : '모임 회원으로 로그인하면 게시글과 하트한 게임도 볼 수 있어요.'}
            </Text>
          </View>
        )}

        {/* 기록 속 사람이 없으면(운영용으로 명단에서 숨긴 계정 등) 전적 칸 자체를 두지 않는다 —
            '연결되지 않았다'는 안내는 실제로 게임을 하는 사람에게만 맞는 말이다. */}
        {member && (
          <>
            <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>전적</Text>
            <RecordCard record={record} self={false} />
            <RecentPlays plays={plays} member={member} onOpenAll={() => openHistoryOf(member.id)} />
          </>
        )}

        {person && (
          <>
            <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>
              하트한 게임
            </Text>
            {hearted.length === 0 ? (
              <Text style={[t.caption, { color: c.textSecondary }]}>
                아직 하트를 누른 게임이 없어요.
              </Text>
            ) : (
              <GameGrid games={hearted} onOpen={setOpenGame} />
            )}

            <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>게시글</Text>
            <PostGrid
              posts={posts}
              emptyText="아직 남긴 글이 없어요."
              onOpen={(p) => openPost(p.id)}
            />
          </>
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

/** 이름 옆 작은 표시(모임장·손님). */
function Badge({ label, color }: { label: string; color: string }) {
  const t = useType();
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[t.caption, styles.badgeText, { color }]}>{label}</Text>
    </View>
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
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly', gap: Spacing.two },
  nameBlock: { flex: 1, gap: Spacing.one },
  info: { gap: Spacing.one },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  badge: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  badgeText: { fontWeight: '700' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: { flex: 1 },
  sectionLabel: { marginTop: Spacing.two },
});
