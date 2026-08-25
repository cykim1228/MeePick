import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon, type IconName } from '@/components/icon';
import { LoginModal } from '@/components/login-modal';
import { MemberGate } from '@/components/member-gate';
import { LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useFeed, useMyProfile } from '@/features/community/hooks';
import { fetchInvites } from '@/features/community/queries';
import { canPickImage, pickImages, postImageUrl, uploadPostImage } from '@/features/community/images';
import { useAuthed } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { signOut } from '@/lib/auth';
import { appOrigin, copyText } from '@/lib/clipboard';
import { timeAgo } from '@/lib/dates';

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
  { href: '/', label: '오늘 뭐 할까 (추천)', icon: 'dice' },
  { href: '/explore', label: '전체 게임', icon: 'grid' },
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
            <Stat label="게시글" value={mine.length} />
            <Stat label="좋아요" value={likesGot} />
          </View>
        </View>

        {editing ? (
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
        ) : (
          <View style={styles.info}>
            <Text style={[t.subtitle, { color: c.text }]}>{profile.displayName}</Text>
            <Text style={[t.caption, { color: c.textSecondary }]}>
              @{profile.handle}
              {profile.realName ? ` · ${profile.realName}` : ''}
            </Text>
            {!!profile.bio && <Text style={[t.body, { color: c.text }]}>{profile.bio}</Text>}
          </View>
        )}

        {error && <Text style={[t.caption, { color: c.danger }]}>{error}</Text>}

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

        <Text style={[t.label, styles.sectionLabel, { color: c.textSecondary }]}>내 게시글</Text>
        {mine.length === 0 ? (
          <Text style={[t.caption, { color: c.textSecondary }]}>
            아직 남긴 글이 없어요. 피드에서 첫 글을 써보세요.
          </Text>
        ) : (
          <View style={styles.grid}>
            {mine.map((p) => {
              const cover = p.imagePaths[0] ? postImageUrl(p.imagePaths[0]) : null;
              return (
                <View
                  key={p.id}
                  style={[styles.cell, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                  {cover ? (
                    <Image
                      source={{ uri: cover }}
                      style={styles.cellImage}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View style={[styles.cellImage, styles.cellTextBox, { backgroundColor: c.backgroundSelected }]}>
                      <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={5}>
                        {p.body}
                      </Text>
                    </View>
                  )}
                  {/* 사진 위가 아니라 아래 띠에 얹는다 — 사진 위에 올리면 밝은 사진에서 안 보인다. */}
                  <View style={[styles.cellMeta, { borderTopColor: c.border }]}>
                    <Icon name="heart" size={13} color={c.textSecondary} filled={p.likeCount > 0} />
                    <Text style={[styles.cellMetaText, { color: c.text }]}>{p.likeCount}</Text>
                    <Text style={[styles.cellMetaText, { color: c.textSecondary, flex: 1, textAlign: 'right' }]}>
                      {timeAgo(p.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            })}
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
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const c = useTheme();
  const t = useType();
  return (
    <View style={styles.stat}>
      <Text style={[t.title, { color: c.text }]}>{value}</Text>
      <Text style={[t.caption, { color: c.textSecondary }]}>{label}</Text>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: {
    width: '31.5%',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cellImage: { width: '100%', aspectRatio: 1 },
  cellTextBox: { padding: Spacing.two, justifyContent: 'center' },
  cellMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cellMetaText: { ...Typography.caption, fontWeight: '600' },
});
