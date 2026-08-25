import { Image } from 'expo-image';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { Radius, Shadow, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useComments } from '@/features/community/hooks';
import { postImageUrl } from '@/features/community/images';
import type { Comment, Post, Profile } from '@/features/community/types';
import { storageImageUrl } from '@/features/games/images';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useMenuToggle } from '@/hooks/use-confirm-once';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { timeAgo } from '@/lib/dates';

/** 이 길이를 넘으면 접고 '더 보기'를 단다. 피드가 글 하나로 도배되지 않게. */
const BODY_CLAMP = 140;

/**
 * 사진 비율의 허용 범위. 인스타그램과 같은 방식이다 —
 * 정사각으로 강제하면 세로 사진의 위아래가, 가로 사진의 좌우가 잘려
 * 정작 찍은 대상이 화면 밖으로 나간다. 원본 비율을 쓰되 극단만 막는다.
 */
const MIN_RATIO = 0.8; // 4:5 세로
const MAX_RATIO = 1.91; // 와이드 가로

/**
 * 피드 한 장.
 *
 * 배치는 인스타그램을 따른다 — 작성자 → 사진 → 좋아요·댓글 → 본문 → 댓글.
 * 사진은 카드 안쪽 여백 없이 꽉 채운다. 여백을 두면 사진이 '첨부파일'처럼 보이고,
 * 꽉 채우면 사진이 주인공이 된다.
 */
export function PostCard({
  post,
  me,
  onLike,
  onEdit,
  onDelete,
}: {
  post: Post;
  me: Profile | null;
  onLike: () => void;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const c = useTheme();
  const t = useType();
  // 폰에서는 카드 테두리를 없애고 화면 끝까지 쓴다 — 인스타그램이 그렇듯,
  // 좁은 폭에서 카드 여백은 사진을 작게 만들 뿐이다. 태블릿·데스크탑은 카드가 낫다.
  const phone = useBreakpoint() === 'compact';
  const [showComments, setShowComments] = useState(false);
  // 메뉴는 카드 안 다른 곳을 건드리면 닫힌다 — 열린 채 남으면 글 내용을 가린다.
  const menu = useMenuToggle<'post'>();
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const mine = me?.id === post.author.id;
  // 모임장은 남의 글도 지울 수 있다(정책도 그렇다). 다만 **수정은 작성자만** —
  // 남의 말을 고쳐 쓰는 건 관리가 아니라 위조다.
  const canDelete = mine || (me?.isAdmin ?? false);

  const long = post.body.length > BODY_CLAMP;
  const shown = long && !expanded ? `${post.body.slice(0, BODY_CLAMP)}…` : post.body;
  const edited = post.updatedAt !== post.createdAt;

  const saveEdit = async () => {
    if (editing === null) return;
    if (await onEdit(editing)) setEditing(null);
  };

  return (
    <View
      {...menu.bind}
      style={[
        styles.card,
        phone
          ? { backgroundColor: c.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }
          : [Shadow.card, { backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg }],
      ]}>
      <View style={styles.header}>
        <Avatar profile={post.author} size={40} />
        <View style={styles.headerText}>
          <Text style={[styles.name, t.body, styles.bold, { color: c.text }]} numberOfLines={1}>
            {post.author.displayName}
          </Text>
          {/* 인스타그램의 '위치' 자리에 모임 이름을 둔다 — 이 글이 어느 모임의 기록인지가
              작성자 다음으로 궁금한 정보다. */}
          <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={1}>
            {post.meetupTitle ? `${post.meetupTitle} · ` : ''}
            {timeAgo(post.createdAt)}
            {edited ? ' · 수정됨' : ''}
          </Text>
        </View>
        {/* 메뉴는 이 버튼 아래에 '겹쳐서' 뜬다. 흐름에 넣으면 글 전체가 아래로 밀려
            누른 지점과 메뉴가 멀어지고 사진 위치까지 흔들린다. */}
        {canDelete && (
          <View style={styles.menuAnchor}>
            <Pressable
              onPress={() => menu.toggle('post')}
              accessibilityRole="button"
              accessibilityLabel="글 메뉴"
              style={styles.iconButton}>
              <Icon name="more" size={20} color={c.textSecondary} />
            </Pressable>
            {menu.openId === 'post' && (
              <View
                {...menu.contentBind}
                style={[
                  styles.menu,
                  Shadow.card,
                  { backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}>
                {mine && (
                  <Pressable
                    onPress={() => {
                      setEditing(post.body);
                      menu.close();
                    }}
                    accessibilityRole="button"
                    style={styles.menuItem}>
                    <Text style={[t.body, { color: c.text }]}>수정</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    menu.close();
                    onDelete();
                  }}
                  accessibilityRole="button"
                  style={styles.menuItem}>
                  <Text style={[t.body, { color: c.danger }]}>삭제</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>

      {post.imagePaths.length > 0 && (
        <Carousel paths={post.imagePaths} onOpen={(p) => setViewer(p)} />
      )}

      {post.gameTitle && (
        <View style={[styles.gameTag, { borderColor: c.border, backgroundColor: c.background }]}>
          {post.gameImagePath ? (
            <Image
              source={{ uri: storageImageUrl(post.gameImagePath) ?? '' }}
              style={[styles.gameThumb, { backgroundColor: c.backgroundSelected }]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={styles.gameDice}>
              <Icon name="dice" size={20} color={c.textSecondary} />
            </View>
          )}
          <Text style={[styles.gameName, { color: c.text }]} numberOfLines={1}>
            {post.gameTitle}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          onPress={onLike}
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? '좋아요 취소' : '좋아요'}
          style={styles.action}>
          <Icon
            name="heart"
            size={26}
            filled={post.likedByMe}
            color={post.likedByMe ? c.accent : c.text}
          />
        </Pressable>
        <Pressable
          onPress={() => setShowComments((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="댓글"
          style={styles.action}>
          <Icon name="message" size={26} color={c.text} />
          {post.commentCount > 0 && (
            <Text style={[styles.actionCount, { color: c.text }]}>{post.commentCount}</Text>
          )}
        </Pressable>
      </View>

      {post.likeCount > 0 && (
        <Text style={[styles.likeLine, t.caption, styles.bold, { color: c.text }]}>
          {likeSummary(post, me)}
        </Text>
      )}

      {editing !== null ? (
        <View style={styles.editBox}>
          <TextInput
            value={editing}
            onChangeText={setEditing}
            multiline
            autoFocus
            style={[styles.editInput, { color: c.text, borderColor: c.border }]}
          />
          <View style={styles.editActions}>
            <Pressable onPress={() => setEditing(null)} accessibilityRole="button" style={styles.editAction}>
              <Text style={[styles.caption, { color: c.textSecondary }]}>취소</Text>
            </Pressable>
            <Pressable onPress={() => void saveEdit()} accessibilityRole="button" style={styles.editAction}>
              <Text style={[styles.name, { color: c.accent }]}>저장</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        !!post.body && (
          <Text style={[styles.body, t.body, { color: c.text }]}>
            <Text style={styles.bold}>{post.author.displayName} </Text>
            {shown}
            {long && !expanded && (
              <Text style={{ color: c.textSecondary }} onPress={() => setExpanded(true)}>
                {'  더 보기'}
              </Text>
            )}
          </Text>
        )
      )}

      {/* 댓글이 없어도 입력 자리를 보여준다 — 인스타그램이 그렇듯, 빈 줄 하나가
          "여기 한마디 남겨도 된다"는 신호가 된다. 실제 목록은 눌러야 불러온다
          (글마다 미리 받으면 피드 한 번에 조회가 글 수만큼 늘어난다). */}
      {!showComments && (
        <Pressable
          onPress={() => setShowComments(true)}
          accessibilityRole="button"
          style={styles.commentPrompt}>
          {me && <Avatar profile={me} size={22} />}
          <Text style={[t.caption, { color: c.textSecondary }]}>
            {post.commentCount > 0 ? `댓글 ${post.commentCount}개 모두 보기` : '댓글 달기…'}
          </Text>
        </Pressable>
      )}

      {showComments && <CommentList postId={post.id} me={me} />}

      {/* 사진 원본 보기 — 피드의 정사각 잘림 때문에 전체가 안 보이는 사진이 있다. */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)} accessibilityLabel="닫기">
          {viewer && (
            <Image
              source={{ uri: postImageUrl(viewer) ?? '' }}
              style={styles.viewerImage}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

/** '민수님 외 2명이 좋아합니다' — 숫자만 있는 것보다 누가 봤는지가 모임에서는 더 중요하다. */
function likeSummary(post: Post, me: Profile | null): string {
  const others = post.likers.filter((p) => p.id !== me?.id);
  if (post.likedByMe) {
    if (others.length === 0) return '내가 좋아합니다';
    return `나와 ${others.length}명이 좋아합니다`;
  }
  if (others.length === 1) return `${others[0].displayName}님이 좋아합니다`;
  if (others.length > 1) return `${others[0].displayName}님 외 ${others.length - 1}명이 좋아합니다`;
  return `좋아요 ${post.likeCount}`;
}

/**
 * 사진 여러 장을 가로로 넘겨 본다.
 * 세로로 쌓으면 사진 세 장짜리 글 하나가 피드를 통째로 차지한다.
 */
function Carousel({ paths, onOpen }: { paths: string[]; onOpen: (path: string) => void }) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  // 첫 장의 비율에 맞춰 높이를 잡는다. 장마다 다르면 넘길 때 카드 높이가 튀어
  // 아래 내용이 위아래로 움직인다 — 인스타그램도 첫 장 기준으로 고정한다.
  const [ratio, setRatio] = useState(1);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  const applyRatio = (w: number, h: number) => {
    if (!w || !h) return;
    setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, w / h)));
  };

  if (paths.length === 1) {
    return (
      <Pressable onPress={() => onOpen(paths[0])} accessibilityRole="imagebutton" accessibilityLabel="사진 크게 보기">
        <Image
          source={{ uri: postImageUrl(paths[0]) ?? '' }}
          style={[styles.photo, { aspectRatio: ratio, backgroundColor: c.backgroundSelected }]}
          contentFit="cover"
          transition={150}
          onLoad={(e) => applyRatio(e.source.width, e.source.height)}
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    );
  }

  return (
    <View onLayout={onLayout}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}>
        {paths.map((p, i) => (
          <Pressable
            key={p}
            onPress={() => onOpen(p)}
            accessibilityRole="imagebutton"
            accessibilityLabel="사진 크게 보기">
            <Image
              source={{ uri: postImageUrl(p) ?? '' }}
              style={[
                styles.photo,
                { width: width || undefined, aspectRatio: ratio, backgroundColor: c.backgroundSelected },
              ]}
              contentFit="cover"
              transition={150}
              onLoad={(e) => i === 0 && applyRatio(e.source.width, e.source.height)}
              accessibilityIgnoresInvertColors
            />
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {paths.map((p, i) => (
          <View
            key={p}
            style={[
              styles.dot,
              { backgroundColor: i === page ? c.accent : c.border, opacity: i === page ? 1 : 0.7 },
            ]}
          />
        ))}
      </View>
      <View style={[styles.counter, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
        <Text style={styles.counterText}>
          {page + 1}/{paths.length}
        </Text>
      </View>
    </View>
  );
}

function CommentList({ postId, me }: { postId: string; me: Profile | null }) {
  const c = useTheme();
  const t = useType();
  const { comments, error, pending, add, remove } = useComments(postId);
  const [draft, setDraft] = useState('');

  const submit = async () => {
    if (!draft.trim()) return;
    if (await add(draft)) setDraft('');
  };

  return (
    <View style={styles.comments}>
      {comments.map((cm: Comment) => (
        <View key={cm.id} style={styles.commentRow}>
          <Avatar profile={cm.author} size={28} />
          <View style={styles.commentBody}>
            <Text style={[t.body, { color: c.text }]}>
              <Text style={styles.commentAuthor}>{cm.author.displayName} </Text>
              {cm.body}
            </Text>
            <Text style={[t.caption, { color: c.textSecondary }]}>{timeAgo(cm.createdAt)}</Text>
          </View>
          {(me?.id === cm.author.id || me?.isAdmin) && (
            <Pressable
              onPress={() => void remove(cm.id)}
              accessibilityRole="button"
              accessibilityLabel="댓글 삭제"
              style={styles.commentDelete}>
              <Icon name="close" size={14} color={c.textSecondary} />
            </Pressable>
          )}
        </View>
      ))}

      {me && (
        <View style={styles.commentInputRow}>
          <Avatar profile={me} size={28} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void submit()}
            placeholder="댓글 달기…"
            placeholderTextColor={c.textSecondary}
            style={[styles.commentInput, t.body, { color: c.text, borderColor: c.border }]}
          />
          <Pressable
            onPress={() => void submit()}
            disabled={pending || !draft.trim()}
            accessibilityRole="button"
            style={styles.iconButton}>
            <Text
              style={[
                t.body,
                styles.commentAuthor,
                { color: c.accent, opacity: pending || !draft.trim() ? 0.4 : 1 },
              ]}>
              게시
            </Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={[t.caption, styles.commentError, { color: c.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', paddingBottom: Spacing.two, gap: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    // 메뉴가 아래 사진에 가리지 않게 헤더 전체를 위 층으로 올린다.
    // 절대배치 자식에만 zIndex를 줘도, 부모가 같은 층이면 뒤에 그려진 사진이 덮는다.
    zIndex: 20,
  },
  headerText: { flex: 1, gap: 2 },
  name: { ...Typography.body, fontWeight: '700' },
  caption: { ...Typography.caption },
  menuDots: { fontSize: 20, lineHeight: 24, fontWeight: '700' },
  // 메뉴를 카드 흐름 밖으로 띄우기 위한 기준점.
  menuAnchor: { position: 'relative' },
  menu: {
    position: 'absolute',
    top: TouchTarget.min,
    right: 0,
    minWidth: 120,
    zIndex: 10,
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  menuItem: { minHeight: TouchTarget.min, justifyContent: 'center', paddingHorizontal: Spacing.three },
  iconButton: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 높이는 onLoad에서 원본 비율로 정한다(MIN_RATIO~MAX_RATIO로 제한).
  photo: { width: '100%' },
  dots: {
    position: 'absolute',
    bottom: Spacing.two,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  dot: { width: 6, height: 6, borderRadius: Radius.full },
  counter: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  counterText: { ...Typography.caption, color: '#FFFFFF', fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 40,
  },
  actionCount: { ...Typography.body, fontWeight: '600' },
  likeLine: {
    ...Typography.caption,
    fontWeight: '700',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.half,
  },
  gameTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    padding: Spacing.one,
    paddingRight: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  gameThumb: { width: 28, height: 28, borderRadius: Radius.full },
  gameDice: { paddingHorizontal: Spacing.one },
  gameName: { ...Typography.caption, fontWeight: '700', flexShrink: 1 },
  body: { ...Typography.body, paddingHorizontal: Spacing.three, paddingTop: Spacing.one },
  commentPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.three,
  },
  editBox: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  editInput: {
    minHeight: 72,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.two,
    ...Typography.body,
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.four },
  editAction: { minHeight: TouchTarget.min, justifyContent: 'center' },
  // 본문이 끝나고 댓글이 시작되는 경계 — 붙어 있으면 어디까지가 글인지 읽히지 않는다.
  comments: { gap: Spacing.three, marginTop: Spacing.three },
  commentRow: {
    flexDirection: 'row',
    // 아바타를 '작성자+내용+시간' 덩어리의 세로 가운데에 둔다.
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  // 본문 텍스트는 styles.body를 쓰지 않는다 — 그쪽엔 카드 좌우 여백이 들어 있어
  // 이미 여백이 있는 댓글 줄에서 한 번 더 밀려 아바타와 어긋난다.
  commentBody: { flex: 1, gap: 1 },
  bold: { fontWeight: '700' },
  commentAuthor: { fontWeight: '700' },
  commentError: { paddingHorizontal: Spacing.three },
  commentDelete: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
  },
  commentInput: {
    flex: 1,
    minHeight: TouchTarget.min,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  viewerImage: { width: '100%', height: '100%' },
});
