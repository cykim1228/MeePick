import { usePathname } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fab } from '@/components/fab';
import { Icon } from '@/components/icon';
import { MemberGate } from '@/components/member-gate';
import { PostCard } from '@/components/post-card';
import { PostComposer } from '@/components/post-composer';
import { SearchBar } from '@/components/search-bar';
import { SheetModal } from '@/components/sheet-modal';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { refreshActivity, useMarkSeen } from '@/features/community/activity';
import { usePostDraft, type PostDraft } from '@/features/community/draft';
import { useFeed, useMyProfile } from '@/features/community/hooks';
import { openNotifications } from '@/features/community/navigation';
import { useInbox } from '@/features/community/notifications';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useTheme } from '@/hooks/use-theme';

/**
 * 모임 피드 — 인스타그램식 세로 카드 목록.
 * 게임 화면(추천·전체·위시)과 달리 그리드가 아니라 한 줄에 한 장이다.
 * 사진과 이야기가 주인공이라 훑는 게 아니라 읽는 화면이기 때문이다.
 */
export default function FeedScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { profile, loading: profileLoading, isMember } = useMyProfile();
  const feed = useFeed(isMember);
  // 폰에서는 카드가 화면 끝까지 붙으므로 목록의 좌우 여백을 없앤다.
  const phone = useBreakpoint() === 'compact';

  const [query, setQuery] = useState('');
  const [writing, setWriting] = useState(false);
  const inbox = useInbox(isMember);

  /**
   * 다른 화면(모임 마무리, 모임 페이지의 '후기 남기기')이 초안을 보내면 글쓰기 창을 연다.
   * 창은 열려야 초안을 받는다 — 안 열어 주면 초안은 전달함에 머문 채, 사람은 빈 피드만 보게 된다.
   */
  const draft = usePostDraft();
  const [seenDraft, setSeenDraft] = useState<PostDraft | null>(null);
  if (draft && draft !== seenDraft) {
    setSeenDraft(draft);
    setWriting(true);
  }

  // 이 화면을 보고 있는 동안은 '봤다'로 유지한다 — 탭 화면은 옮겨 다녀도 마운트된 채 남아서,
  // 뜰 때 한 번만 적으면 다시 돌아왔을 때 점이 안 꺼진다.
  useMarkSeen('feed', usePathname() === '/feed');
  useEffect(() => {
    void refreshActivity();
  }, []);

  /**
   * 검색은 클라이언트에서 한다. 글이 수천 개가 되기 전까지는 이미 받아 둔 목록을
   * 훑는 쪽이 빠르고(서버 왕복이 없다) 오프라인에서도 동작한다.
   *
   * 본문뿐 아니라 작성자·게임·일정 이름까지 본다 — "아줄" 하고 찾을 때 사람이 기대하는 건
   * 본문에 '아줄'이 적힌 글이 아니라 아줄을 한 날의 글이다.
   */
  const posts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return feed.posts;
    return feed.posts.filter((p) =>
      [p.body, p.author.displayName, p.gameTitle, p.meetupTitle]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle))
    );
  }, [feed.posts, query]);

  const filtering = query.trim().length > 0;

  if (profileLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <LoadingView />
      </View>
    );
  }

  if (!isMember || !profile) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <MemberGate />
      </View>
    );
  }

  // 목록을 아예 못 받았을 때만 화면을 오류로 바꾼다. 좋아요 실패 같은 작은 오류로
  // 이미 보이던 글이 통째로 사라지면 안 된다 — 그런 오류는 검색창 아래 한 줄로 남긴다.
  if (feed.error && !feed.posts.length) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <ErrorView message={feed.error} onRetry={() => void feed.reload()} />
      </View>
    );
  }

  // 화면 제목("모임 피드")을 두지 않는다 — 탭 바가 이미 '피드'라고 말하고 있고,
  // 32px 제목이 첫 화면의 3분의 1을 먹으면 정작 글이 안 보인다.
  return (
    <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {/* 검색은 목록 밖에 둔다 — 머리말에 넣으면 스크롤을 조금만 내려도 사라져서,
          찾으려면 맨 위까지 되돌아가야 한다. */}
      <View style={[styles.bar, { borderBottomColor: c.border }]}>
        <View style={styles.barRow}>
          <View style={styles.search}>
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="글 · 사람 · 게임 이름으로 찾기"
              hint={filtering ? `${posts.length}개` : undefined}
            />
          </View>
          {/* 알림함 — 내 글에 달린 댓글·좋아요, 새 일정. 모임 소식을 보러 오는 곳이 피드라 여기 둔다. */}
          <Pressable
            onPress={openNotifications}
            accessibilityRole="button"
            accessibilityLabel={inbox.hasUnread ? '알림, 새 알림 있음' : '알림'}
            style={({ pressed }) => [styles.bell, pressed && styles.pressed]}>
            <Icon name="bell" size={22} color={c.text} />
            {inbox.hasUnread && (
              <View style={[styles.bellDot, { backgroundColor: c.accent, borderColor: c.background }]} />
            )}
          </Pressable>
        </View>
        {feed.error && <Text style={[styles.error, { color: c.danger }]}>{feed.error}</Text>}
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[
          styles.list,
          phone && styles.listPhone,
          { paddingBottom: insets.bottom + Spacing.six },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            me={profile}
            onLike={() => void feed.like(item)}
            onEdit={(body) => feed.edit(item.id, body)}
            onDelete={() => void feed.remove(item.id)}
          />
        )}
        ListEmptyComponent={
          feed.loading ? (
            <LoadingView />
          ) : filtering ? (
            <EmptyView title="찾는 글이 없어요" hint="검색어를 줄이거나 조건을 바꿔보세요." />
          ) : (
            <EmptyView
              title="아직 글이 없어요"
              hint="오른쪽 아래 ＋ 로 첫 글을 남겨보세요. 사진도 함께 올릴 수 있습니다."
            />
          )
        }
      />

      <Fab icon="plus" label="글쓰기" accessibilityLabel="글 쓰기" onPress={() => setWriting(true)} />

      <SheetModal visible={writing} onClose={() => setWriting(false)}>
        <PostComposer
          pending={feed.pending}
          onSubmit={async (input) => {
            const ok = await feed.write(input);
            if (ok) setWriting(false);
            return ok;
          }}
        />
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // 한 줄에 한 장이라 폭을 제한한다. 태블릿 가로에서 카드가 화면 끝까지 늘어나면
  // 사진이 과하게 커지고 한 화면에 한 장밖에 안 들어온다.
  list: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  // 폰: 카드가 화면 폭을 꽉 쓰고 카드끼리는 선으로 나뉜다(인스타그램식).
  listPhone: { paddingHorizontal: 0, paddingTop: 0, gap: 0 },
  error: { ...Typography.caption, paddingTop: Spacing.one },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  search: { flex: 1, minWidth: 0 },
  bell: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
  pressed: { opacity: 0.6 },
  bar: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
});
