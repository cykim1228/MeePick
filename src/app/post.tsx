import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader, DETAIL_MAX_WIDTH, goBack } from '@/components/back-header';
import { MemberGate } from '@/components/member-gate';
import { PostCard } from '@/components/post-card';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Spacing, Typography } from '@/constants/theme';
import { useFeed, useMyProfile } from '@/features/community/hooks';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useTheme } from '@/hooks/use-theme';

/**
 * 글 하나 — `/post?id=<글 id>`.
 *
 * 프로필 격자에서 글을 누르면 여기로 온다. 피드로 보내 그 글을 찾아 스크롤하게 하면
 * 격자에서 본 글이 어디 있는지 사람이 다시 찾아야 한다. 인스타그램처럼 그 글만 연다.
 *
 * 피드와 같은 목록(스토어)을 본다 — 여기서 좋아요를 누르거나 지우면 피드와 프로필에도
 * 곧바로 반영된다. 댓글은 처음부터 펼쳐 둔다. 글 하나를 연 사람은 대개 댓글까지 보려는 것이다.
 */
export default function PostScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  // 글이 바뀌면 화면 상태(펼친 본문·편집 중인 글)를 새로 시작한다 — 탭 화면은 살아 있다.
  return <PostView key={id} id={id} />;
}

function PostView({ id }: { id: string }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const phone = useBreakpoint() === 'compact';
  const { profile, loading, isMember } = useMyProfile();
  const feed = useFeed(isMember);
  const [leaving, setLeaving] = useState(false);

  const post = feed.posts.find((p) => p.id === id) ?? null;
  const screen = [styles.screen, { backgroundColor: c.background, paddingTop: insets.top }];
  const title = !post
    ? '글'
    : post.author.id === profile?.id
      ? '내 글'
      : `${post.author.displayName}님의 글`;

  // 지우고 나면 뒤로 간다. 지워지는 사이에 '글을 찾을 수 없어요'가 번쩍이지 않게 먼저 가린다.
  const remove = async () => {
    setLeaving(true);
    if (await feed.remove(id)) goBack('/feed');
    else setLeaving(false);
  };

  if (loading || leaving || (isMember && feed.loading)) {
    return (
      <View style={screen}>
        <BackHeader title={title} fallback="/feed" />
        <LoadingView />
      </View>
    );
  }

  if (!isMember || !profile) {
    return (
      <View style={screen}>
        <BackHeader title={title} fallback="/feed" />
        <MemberGate />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={screen}>
        <BackHeader title={title} fallback="/feed" />
        {feed.error ? (
          <ErrorView message={feed.error} onRetry={() => void feed.reload()} />
        ) : (
          <EmptyView
            title="글을 찾을 수 없어요"
            hint="지워졌거나, 최근 100개보다 오래된 글이에요."
          />
        )}
      </View>
    );
  }

  return (
    <View style={screen}>
      <BackHeader title={title} fallback="/feed" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          phone && styles.contentPhone,
          { paddingBottom: insets.bottom + Spacing.six },
        ]}>
        {/* 좋아요 실패 같은 작은 오류는 글을 가리지 않고 위에 한 줄로 남긴다. */}
        {feed.error && <Text style={[styles.error, { color: c.danger }]}>{feed.error}</Text>}
        <PostCard
          post={post}
          me={profile}
          commentsOpen
          onLike={() => void feed.like(post)}
          onEdit={(body) => feed.edit(post.id, body)}
          onDelete={() => void remove()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
    maxWidth: DETAIL_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  // 폰에서는 피드처럼 카드가 화면 끝까지 붙는다.
  contentPhone: { paddingHorizontal: 0, paddingTop: 0 },
  error: { ...Typography.caption, paddingHorizontal: Spacing.three },
});
