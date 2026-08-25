import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminGate, AdminHeader } from '@/components/admin-gate';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useFeed } from '@/features/community/hooks';
import { postImageUrl } from '@/features/community/images';
import { useConfirmOnce } from '@/hooks/use-confirm-once';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { timeAgo } from '@/lib/dates';

/**
 * 피드 관리 — 모임장 전용.
 *
 * 피드 화면과 달리 사진·본문을 한 줄로 압축해 보여준다. 여기서 할 일은 '읽기'가 아니라
 * '골라내기'라, 한 화면에 많이 보이는 편이 낫다.
 */
export default function AdminPostsScreen() {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const feed = useFeed(true);
  // 확인 상태는 다른 곳을 건드리면 풀린다 — 남아 있으면 무심코 누른 한 번에 지워진다.
  const confirm = useConfirmOnce<string>();

  return (
    <AdminGate>
      <View
        {...confirm.bind}
        style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <AdminHeader title="피드 관리" subtitle={`글 ${feed.posts.length}개`} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}>
          {feed.error && <Text style={[t.caption, { color: c.danger }]}>{feed.error}</Text>}
          {feed.loading && <LoadingView />}

          {feed.posts.map((p) => {
            const cover = p.imagePaths[0] ? postImageUrl(p.imagePaths[0]) : null;
            return (
              <View
                key={p.id}
                style={[styles.row, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                {cover ? (
                  <Image
                    source={{ uri: cover }}
                    style={[styles.thumb, { backgroundColor: c.backgroundSelected }]}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: c.backgroundSelected }]}>
                    <Icon name="message" size={18} color={c.textSecondary} />
                  </View>
                )}

                <View style={styles.rowText}>
                  <View style={styles.authorRow}>
                    <Avatar profile={p.author} size={20} />
                    <Text style={[t.caption, styles.author, { color: c.text }]} numberOfLines={1}>
                      {p.author.displayName}
                    </Text>
                    <Text style={[t.caption, { color: c.textSecondary }]}>{timeAgo(p.createdAt)}</Text>
                  </View>
                  <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={2}>
                    {p.body || '(사진만 있는 글)'}
                  </Text>
                  <Text style={[t.caption, { color: c.textSecondary }]}>
                    ♥ {p.likeCount} · 댓글 {p.commentCount}
                    {p.imagePaths.length > 1 ? ` · 사진 ${p.imagePaths.length}장` : ''}
                  </Text>
                </View>

                <Pressable
                  onPress={() => confirm.press(p.id, () => void feed.remove(p.id))}
                  disabled={feed.pending}
                  accessibilityRole="button"
                  accessibilityLabel="글 삭제"
                  style={[styles.deleteButton, { borderColor: c.danger }]}>
                  <Text style={[t.caption, { color: c.danger }]}>
                    {confirm.pendingId === p.id ? '정말?' : '삭제'}
                  </Text>
                </Pressable>
              </View>
            );
          })}

          {!feed.loading && feed.posts.length === 0 && (
            <Text style={[t.caption, { color: c.textSecondary }]}>아직 글이 없어요.</Text>
          )}
        </ScrollView>
      </View>
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.two,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 52, height: 52, borderRadius: Radius.sm },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  author: { fontWeight: '700', flexShrink: 1 },
  deleteButton: {
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
