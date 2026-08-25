import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { MemberGate } from '@/components/member-gate';
import { PostCard } from '@/components/post-card';
import { PostComposer } from '@/components/post-composer';
import { SearchBar } from '@/components/search-bar';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Spacing, Typography } from '@/constants/theme';
import { markSeen, refreshActivity } from '@/features/community/activity';
import { useFeed, useMyProfile } from '@/features/community/hooks';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useTheme } from '@/hooks/use-theme';

/** 피드를 좁히는 축. 사람들이 실제로 찾는 건 이 셋이다 — 전부, 사진, 내가 쓴 것. */
type FeedScope = 'all' | 'photo' | 'mine';

const SCOPES: { key: FeedScope; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'photo', label: '사진' },
  { key: 'mine', label: '내 글' },
];

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
  const [scope, setScope] = useState<FeedScope>('all');

  /**
   * 이 화면을 열면 '봤다'고 적는다. 목록이 도착한 뒤에 적어야 —
   * 화면을 여는 사이 올라온 글까지 읽은 것으로 넘어가지 않는다.
   */
  useEffect(() => {
    void refreshActivity().then(() => markSeen('feed'));
  }, [feed.posts.length]);

  /**
   * 검색은 클라이언트에서 한다. 글이 수천 개가 되기 전까지는 이미 받아 둔 목록을
   * 훑는 쪽이 빠르고(서버 왕복이 없다) 오프라인에서도 동작한다.
   *
   * 본문뿐 아니라 작성자·게임·일정 이름까지 본다 — "아줄" 하고 찾을 때 사람이 기대하는 건
   * 본문에 '아줄'이 적힌 글이 아니라 아줄을 한 날의 글이다.
   */
  const posts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return feed.posts.filter((p) => {
      if (scope === 'mine' && p.author.id !== profile?.id) return false;
      if (scope === 'photo' && p.imagePaths.length === 0) return false;
      if (!needle) return true;
      return [p.body, p.author.displayName, p.gameTitle, p.meetupTitle]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle));
    });
  }, [feed.posts, query, scope, profile?.id]);

  const filtering = query.trim().length > 0 || scope !== 'all';

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

  if (feed.error) {
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
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[
          styles.list,
          phone && styles.listPhone,
          { paddingBottom: insets.bottom + Spacing.six },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={[styles.header, phone && styles.headerPhone]}>
            <PostComposer
              me={profile}
              pending={feed.pending}
              onSubmit={(input) => feed.write(input)}
            />
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="글·사람·게임 이름으로 찾기"
            />
            <View style={styles.scopeRow}>
              {SCOPES.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  selected={scope === s.key}
                  onPress={() => setScope(s.key)}
                />
              ))}
              {filtering && (
                <Text style={[styles.count, { color: c.textSecondary }]}>{posts.length}개</Text>
              )}
            </View>
          </View>
        }
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
              hint="위에서 첫 글을 남겨보세요. 사진도 함께 올릴 수 있습니다."
            />
          )
        }
      />
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
  header: { gap: Spacing.three },
  scopeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  count: { ...Typography.caption },
  headerPhone: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.three },
});
