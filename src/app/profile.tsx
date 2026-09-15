import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { CenterModal } from '@/components/center-modal';
import { GameDetail } from '@/components/game-detail';
import { Icon, type IconName } from '@/components/icon';
import { LoginModal } from '@/components/login-modal';
import { MemberGate } from '@/components/member-gate';
import {
  GameGrid,
  PostGrid,
  ProfileStat,
  RecentPlays,
  RecordCard,
} from '@/components/profile-parts';
import { LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useFeed, useMyProfile } from '@/features/community/hooks';
import { openHistoryOf, openPost } from '@/features/community/navigation';
import { fetchInvites } from '@/features/community/queries';
import { useGames, useWishlist } from '@/features/games/hooks';
import { useGameLikeStore } from '@/features/games/likes';
import type { Game } from '@/features/games/types';
import { usePlayHistory, useSession } from '@/features/plays/hooks';
import { computeMemberRecord } from '@/features/plays/record';
import { canPickImage, pickImages, uploadPostImage } from '@/features/community/images';
import { useAuthed } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { signOut } from '@/lib/auth';
import { appOrigin, copyText } from '@/lib/clipboard';

/**
 * 폰 하단 바에서 빠진 메뉴들이 여기로 들어온다.
 * 전부 나열하는 이유: 하단 바에 있는 것도 여기서 보이면 "어디로 가야 하지"를 한 번에 끝낸다.
 */
/** 모임장에게만 보이는 관리 메뉴. 실제 차단은 DB 정책이 하고, 여기서는 안 보이게만 한다. */
const ADMIN_MENU: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin-users', label: '사용자 관리', icon: 'user' },
  { href: '/admin-posts', label: '피드 관리', icon: 'list' },
];

const MENU: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: '오늘 뭐 할까 (게임)', icon: 'dice' },
  { href: '/explore', label: '게임 목록', icon: 'grid' },
  { href: '/wishlist', label: '위시리스트', icon: 'star' },
  { href: '/history', label: '플레이 기록', icon: 'list' },
  { href: '/hall-of-fame', label: '명예의 전당', icon: 'trophy' },
];

/**
 * 프로필 — 다른 화면과 같은 탭 하나다.
 *
 * 팝업이 아니라 라우트인 이유: 팝업은 하단 바를 덮어 버려서, 프로필을 열면 다른 탭으로
 * 바로 못 간다. 탭으로 두면 어느 화면에서든 내비게이션이 그대로 남는다.
 */
export default function ProfileScreen() {
  const c = useTheme();
  const t = useType();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const authed = useAuthed();
  const { profile, loading, save } = useMyProfile();
  const feed = useFeed(!!profile);

  const [login, setLogin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 내 전적.
   *
   * 플레이 기록은 members 행에 걸려 있고, 계정과 그 행은 profile_id로 이어져 있다.
   * 아직 안 이어진 사람(손님으로만 기록이 쌓인 경우)은 전적이 안 보이는 게 정상이라,
   * 그 사실을 숨기지 않고 이유를 알려 준다 — 안 그러면 "내 기록이 없어졌다"가 된다.
   */
  const { members } = useSession();
  const { plays } = usePlayHistory();
  const myMember = useMemo(
    () => members.find((m) => m.profileId === profile?.id) ?? null,
    [members, profile?.id]
  );

  const record = useMemo(
    () => (myMember ? computeMemberRecord(plays, myMember) : null),
    [plays, myMember]
  );

  /** 내가 하트한 게임 — 온보딩에서 고른 것을 나중에 다시 보고 고칠 곳이 여기다. */
  const { all: owned } = useGames();
  const wish = useWishlist();
  const likes = useGameLikeStore();
  // 회원 프로필과 같은 방식으로 센다(누가 눌렀는지 목록에서 나를 찾는다) — 두 화면의 숫자가
  // 서로 다른 길로 계산되면 언젠가 어긋난다.
  const hearted = useMemo(() => {
    const myId = profile?.id;
    if (!myId) return [];
    return [...owned, ...wish.games].filter((g) => likes.byGame.get(g.id)?.has(myId));
  }, [owned, wish.games, likes.byGame, profile?.id]);
  const [openGame, setOpenGame] = useState<Game | null>(null);

  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  // 모임 전체가 쓰는 재사용 코드를 찾는다. 실패하면 링크만 안 보일 뿐 다른 것은 멀쩡하다.
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    fetchInvites()
      .then((list) => {
        const shared = list.find((i) => i.isReusable) ?? list[0];
        if (alive && shared) setInviteCode(shared.code);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [profile]);

  const inviteLink = inviteCode ? `${appOrigin()}/join?code=${inviteCode}` : '';

  const copyInvite = async () => {
    if (!inviteLink) return;
    if (await copyText(inviteLink)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setError('복사가 막혔어요. 주소를 길게 눌러 직접 복사해 주세요.');
    }
  };

  const screen = [styles.screen, { backgroundColor: c.background, paddingTop: insets.top }];

  if (loading || authed === null) {
    return (
      <View style={screen}>
        <LoadingView />
      </View>
    );
  }

  if (!authed) {
    return (
      <View style={screen}>
        <View style={styles.center}>
          <Icon name="user" size={44} color={c.textSecondary} />
          <Text style={[t.title, { color: c.text, textAlign: 'center' }]}>로그인이 필요해요</Text>
          <Text style={[t.body, { color: c.textSecondary, textAlign: 'center' }]}>
            게임 목록은 로그인 없이 볼 수 있어요. 피드·일정과 기록은 회원만 가능합니다.
          </Text>
          <Pressable
            onPress={() => setLogin(true)}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: c.accent }]}>
            <Text style={[t.body, { color: c.onAccent, fontWeight: '700' }]}>로그인 · 가입</Text>
          </Pressable>
        </View>
        <LoginModal visible={login} onClose={() => setLogin(false)} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={screen}>
        <MemberGate />
      </View>
    );
  }

  const mine = feed.posts.filter((p) => p.author.id === profile.id);
  const likesGot = mine.reduce((sum, p) => sum + p.likeCount, 0);

  const startEdit = () => {
    setNickname(profile.displayName);
    setBio(profile.bio ?? '');
    setError(null);
    setEditing(true);
  };

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const saveEdit = () =>
    run(async () => {
      if (!nickname.trim()) throw new Error('닉네임을 입력하세요.');
      await save({ displayName: nickname, bio });
      setEditing(false);
    });

  const changeAvatar = () =>
    run(async () => {
      const files = await pickImages();
      if (!files.length) return;
      await save({ avatarPath: await uploadPostImage(files[0]) });
    });

  return (
    <View style={screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}>
        <View style={styles.top}>
          <Pressable
            onPress={() => canPickImage && void changeAvatar()}
            disabled={!canPickImage || pending}
            accessibilityRole="button"
            accessibilityLabel="프로필 사진 바꾸기"
            style={styles.avatarWrap}>
            <Avatar profile={profile} size={84} />
            {canPickImage && (
              <View style={[styles.avatarEdit, { backgroundColor: c.accent, borderColor: c.background }]}>
                <Icon name="image" size={15} color={c.onAccent} />
              </View>
            )}
          </Pressable>

          <View style={styles.stats}>
            <ProfileStat label="게시글" value={mine.length} />
            <ProfileStat label="받은 좋아요" value={likesGot} />
            <ProfileStat label="하트한 게임" value={hearted.length} />
          </View>
        </View>

        <View style={styles.info}>
          <Text style={[t.subtitle, { color: c.text }]}>{profile.displayName}</Text>
          <Text style={[t.caption, { color: c.textSecondary }]}>
            @{profile.handle}
            {profile.realName ? ` · ${profile.realName}` : ''}
          </Text>
          {!!profile.bio && <Text style={[t.body, { color: c.text }]}>{profile.bio}</Text>}
        </View>

        {error && <Text style={[t.caption, { color: c.danger }]}>{error}</Text>}

        {/* 내 전적 — 이 앱이 제일 잘 아는 것이 여기다. */}
        <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>내 전적</Text>
        <RecordCard record={record} self />
        {myMember && (
          <RecentPlays
            plays={plays}
            member={myMember}
            onOpenAll={() => openHistoryOf(myMember.id)}
          />
        )}

        <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>모든 메뉴</Text>
        <View style={[styles.menuList, { borderColor: c.border }]}>
          {MENU.map((m) => (
            <Pressable
              key={m.href}
              onPress={() => router.push(m.href as '/')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.menuRow,
                { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 },
              ]}>
              <Icon name={m.icon} size={20} color={c.textSecondary} />
              <Text style={[t.body, { color: c.text, flex: 1 }]}>{m.label}</Text>
              <Icon name="chevronRight" size={18} color={c.textSecondary} />
            </Pressable>
          ))}
        </View>

        {profile.isAdmin && (
          <>
            <Text style={[t.label, styles.sectionLabel, { color: c.accent }]}>모임장 메뉴</Text>
            <View style={[styles.menuList, { borderColor: c.accent }]}>
              {ADMIN_MENU.map((m) => (
                <Pressable
                  key={m.href}
                  onPress={() => router.push(m.href as '/')}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.menuRow,
                    { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <Icon name={m.icon} size={20} color={c.accent} />
                  <Text style={[t.body, { color: c.text, flex: 1 }]}>{m.label}</Text>
                  <Icon name="chevronRight" size={18} color={c.textSecondary} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>
          하트한 게임
        </Text>
        {hearted.length === 0 ? (
          <Text style={[t.caption, { color: c.textSecondary }]}>
            아직 하트한 게임이 없어요. 게임 목록에서 하고 싶은 게임에 하트를 눌러 보세요.
          </Text>
        ) : (
          <GameGrid games={hearted} onOpen={setOpenGame} />
        )}

        <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>내 게시글</Text>
        <PostGrid
          posts={mine}
          emptyText="아직 남긴 글이 없어요. 피드에서 첫 글을 써보세요."
          onOpen={(p) => openPost(p.id)}
        />

        {/* 친구 초대 — 코드를 말로 불러 주는 대신 링크 한 줄로 끝낸다.
            링크는 지금 열려 있는 주소에서 만든다. 집에서 8089로 쓰는 사람에게는 8089 주소가,
            도메인으로 들어온 사람에게는 도메인 주소가 나가야 상대가 열 수 있다. */}
        <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>친구 초대</Text>
        <Pressable
          onPress={() => void copyInvite()}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.inviteRow,
            { borderColor: c.accent, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Icon name="user" size={20} color={c.accent} />
          <View style={styles.inviteText}>
            <Text style={[t.body, { color: c.text, fontWeight: '600' }]}>
              {copied ? '링크를 복사했어요' : '초대 링크 복사'}
            </Text>
            <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={1}>
              {inviteLink || '참여 코드를 불러오는 중…'}
            </Text>
          </View>
        </Pressable>

        {/* 편집 창은 '프로필 편집' 버튼 바로 위에 연다 — 버튼과 창이 멀면 눌러 놓고
            화면 위로 되돌아가야 한다. 위쪽 프로필 카드에서 열던 것을 여기로 내렸다. */}
        {editing && (
          <View style={styles.editBox}>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="닉네임"
              placeholderTextColor={c.textSecondary}
              style={[styles.input, t.body, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
            />
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="한 줄 소개 (선택)"
              placeholderTextColor={c.textSecondary}
              style={[styles.input, t.body, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
            />
            <View style={styles.rowButtons}>
              <Pressable
                onPress={() => setEditing(false)}
                accessibilityRole="button"
                style={[styles.outlineButton, styles.flex, { borderColor: c.border }]}>
                <Text style={[t.body, { color: c.textSecondary, fontWeight: '600' }]}>취소</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveEdit()}
                disabled={pending}
                accessibilityRole="button"
                style={[styles.button, styles.flex, { backgroundColor: c.accent, opacity: pending ? 0.4 : 1 }]}>
                <Text style={[t.body, { color: c.onAccent, fontWeight: '700' }]}>저장</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* 프로필 편집과 로그아웃은 같은 '계정 관리'라 아래에 나란히 둔다. */}
        <View style={[styles.rowButtons, styles.accountActions]}>
          <Pressable
            onPress={startEdit}
            accessibilityRole="button"
            style={[styles.outlineButton, styles.flex, { borderColor: c.border }]}>
            <Text style={[t.body, { color: c.text, fontWeight: '600' }]}>프로필 편집</Text>
          </Pressable>
          <Pressable
            onPress={() => void run(signOut)}
            disabled={pending}
            accessibilityRole="button"
            style={[styles.outlineButton, styles.flex, { borderColor: c.border }]}>
            <Text style={[t.body, { color: c.danger, fontWeight: '600' }]}>로그아웃</Text>
          </Pressable>
        </View>
      </ScrollView>

      <CenterModal visible={!!openGame} onClose={() => setOpenGame(null)}>
        {openGame && (
          <GameDetail game={openGame} playerCount={null} onClose={() => setOpenGame(null)} />
        )}
      </CenterModal>
    </View>
  );
}


const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  avatarWrap: { alignSelf: 'flex-start' },
  // 배경색 테두리를 둘러 아바타 위에 '떠 있는' 배지로 보이게 한다.
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' },
  stat: { alignItems: 'center', gap: 2 },
  info: { gap: Spacing.one },
  sectionLabel: { marginTop: Spacing.two },
  editBox: { gap: Spacing.two },
  rowButtons: { flexDirection: 'row', gap: Spacing.two },
  accountActions: { marginTop: Spacing.four },
  flex: { flex: 1 },
  input: {
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  button: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
  },
  outlineButton: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  inviteText: { flex: 1, minWidth: 0, gap: 2 },
  menuList: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: TouchTarget.primary,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 인스타그램식 3열 격자. 사진이 없는 글은 본문 미리보기로 채운다.
});
