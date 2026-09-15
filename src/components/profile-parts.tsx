import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { postImageUrl } from '@/features/community/images';
import type { Post } from '@/features/community/types';
import { gameImageUrl, storageImageUrl } from '@/features/games/images';
import type { Game } from '@/features/games/types';
import type { PlayWithGame } from '@/features/plays/queries';
import type { MemberRecord } from '@/features/plays/record';
import type { Member } from '@/features/plays/types';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { localDateOf, timeAgo } from '@/lib/dates';

/**
 * 프로필 화면 조각들 — 내 프로필과 다른 회원 프로필이 같은 것을 쓴다.
 *
 * 두 화면이 따로 그리면 내 전적과 남의 전적이 조금씩 다르게 생겨, "같은 정보"라는 게
 * 한눈에 안 들어온다. 차이는 문구(내 / 이 회원의)뿐이어야 한다.
 */

/** 숫자 한 칸. 값이 크고 라벨이 작아야 숫자가 먼저 읽힌다. */
export function ProfileStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  const c = useTheme();
  const t = useType();
  return (
    <View style={styles.stat}>
      <Text style={[t.title, { color: c.text }]}>
        {value}
        {suffix ?? ''}
      </Text>
      <Text style={[t.caption, styles.statLabel, { color: c.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * 전적 카드.
 *
 * record가 null이면 플레이 기록이 계정과 아직 안 이어진 것이다 — 숨기지 않고 이유를 말한다.
 * 안 그러면 본인은 "내 기록이 없어졌다", 남은 "이 사람은 한 판도 안 했다"로 오해한다.
 */
export function RecordCard({ record, self }: { record: MemberRecord | null; self: boolean }) {
  const c = useTheme();
  const t = useType();

  if (record === null) {
    return (
      <View style={[styles.note, { borderColor: c.border }]}>
        <Icon name="list" size={16} color={c.textSecondary} />
        <Text style={[t.caption, styles.noteText, { color: c.textSecondary }]}>
          {self
            ? '아직 플레이 기록이 이 계정과 연결되지 않았어요. 손님 이름으로 남은 기록이 있다면 모임장이 ‘사용자 관리 → 기록 잇기’로 이어 줄 수 있습니다.'
            : '이 회원의 플레이 기록이 아직 계정과 연결되지 않았어요.'}
        </Text>
      </View>
    );
  }

  if (record.plays === 0) {
    return (
      <Text style={[t.caption, { color: c.textSecondary }]}>
        {self
          ? '아직 함께한 판이 없어요. 모임에서 한 판 하고 나면 여기에 쌓입니다.'
          : '아직 함께한 판이 없어요.'}
      </Text>
    );
  }

  return (
    <View style={[styles.record, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={styles.recordTop}>
        <ProfileStat label="판" value={record.plays} />
        <ProfileStat label="승" value={record.wins} />
        <ProfileStat
          label="승률"
          value={record.rounds ? Math.round((record.wins / record.rounds) * 100) : 0}
          suffix="%"
        />
        {record.bestStreak > 1 && <ProfileStat label="최고 연승" value={record.bestStreak} />}
      </View>
      {record.favorite && (
        <Text style={[t.caption, { color: c.textSecondary }]}>
          가장 많이 한 게임 · {record.favorite[0]} {record.favorite[1]}판
        </Text>
      )}
      {record.best && (
        <Text style={[t.caption, { color: c.textSecondary }]}>
          최고 점수 · {record.best.title} {record.best.score}점
        </Text>
      )}
    </View>
  );
}

/** 한 판에서 이 사람이 어땠는지 한 줄로. 라운드가 없는 판(빠른 기록)은 결과를 말하지 않는다. */
function playResult(play: PlayWithGame, memberId: string): { text: string; won: boolean } {
  const rounds = play.rounds;
  if (rounds.length === 0) return { text: '라운드 기록 없음', won: false };
  if (rounds.every((r) => r.coop !== null)) {
    const won = rounds.filter((r) => r.coop === 'win').length;
    if (rounds.length === 1) return { text: won ? '협동 승리' : '협동 패배', won: won > 0 };
    return { text: `협동 ${won}승 ${rounds.length - won}패`, won: won > 0 };
  }
  const wins = rounds.filter((r) => r.winnerIds.includes(memberId)).length;
  const tail = rounds.length > 1 ? ` · ${rounds.length}라운드` : '';
  return { text: `${wins > 0 ? `${wins}승` : '승리 없음'}${tail}`, won: wins > 0 };
}

/**
 * 최근에 함께한 판 몇 개와 '기록 모두 보기'.
 *
 * 전적 숫자만으로는 "요즘 뭐 했지"가 안 보인다. 최근 판을 몇 줄 두고, 더 보려면
 * 그 사람만 걸러 둔 기록 화면으로 보낸다 — 프로필 안에서 긴 목록을 다시 만들지 않는다.
 */
export function RecentPlays({
  plays,
  member,
  limit = 3,
  onOpenAll,
}: {
  plays: PlayWithGame[];
  member: Member;
  limit?: number;
  onOpenAll: () => void;
}) {
  const c = useTheme();
  const t = useType();
  const mine = plays.filter((p) => p.endedAt && p.memberIds.includes(member.id));
  if (mine.length === 0) return null;

  return (
    <View style={styles.recent}>
      {mine.slice(0, limit).map((p) => {
        const cover = p.gameImagePath ? storageImageUrl(p.gameImagePath) : null;
        const result = playResult(p, member.id);
        return (
          <View key={p.id} style={[styles.recentRow, { borderBottomColor: c.border }]}>
            <View style={[styles.recentThumb, { backgroundColor: c.backgroundSelected }]}>
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={[t.caption, { color: c.textSecondary }]}>
                  {p.gameTitle.slice(0, 1)}
                </Text>
              )}
            </View>
            <View style={styles.recentText}>
              <Text style={[t.body, styles.bold, { color: c.text }]} numberOfLines={1}>
                {p.gameTitle}
              </Text>
              <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={1}>
                {localDateOf(p.endedAt as string)}
              </Text>
            </View>
            <Text
              style={[t.caption, styles.bold, { color: result.won ? c.accent : c.textSecondary }]}
              numberOfLines={1}>
              {result.text}
            </Text>
          </View>
        );
      })}
      <Pressable onPress={onOpenAll} accessibilityRole="button" style={styles.moreLink}>
        <Text style={[t.caption, styles.bold, { color: c.accent }]}>
          기록 {mine.length}판 모두 보기 ›
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * 게임 표지 격자 — 프로필의 '하트한 게임'.
 *
 * 네 칸짜리 작은 표지다. 훑어보는 목록이라 표지가 작아도 알아본다. 위시(아직 집에 없는)
 * 게임에는 띠를 둘러, 같은 하트라도 '하고 싶다'와 '사고 싶다'가 구분되게 한다.
 */
export function GameGrid({ games, onOpen }: { games: Game[]; onOpen: (game: Game) => void }) {
  const c = useTheme();
  const t = useType();

  return (
    <View style={styles.games}>
      {games.map((g) => {
        const url = gameImageUrl(g);
        return (
          <Pressable
            key={g.id}
            onPress={() => onOpen(g)}
            accessibilityRole="button"
            accessibilityLabel={g.owned ? g.titleKo : `${g.titleKo} (위시)`}
            style={({ pressed }) => [styles.gameCell, pressed && styles.pressed]}>
            <View style={[styles.gameCover, { backgroundColor: c.backgroundSelected }]}>
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={[t.caption, { color: c.textSecondary }]}>{g.titleKo.slice(0, 2)}</Text>
              )}
              {!g.owned && (
                <View style={[styles.wishBand, { backgroundColor: c.accent }]}>
                  <Text style={[styles.wishText, { color: c.onAccent }]}>위시</Text>
                </View>
              )}
            </View>
            <Text style={[t.caption, styles.gameTitle, { color: c.text }]} numberOfLines={1}>
              {g.titleKo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 게시글 격자 — 사진이 있으면 사진, 없으면 본문 앞부분. 누르면 그 글이 열린다. */
export function PostGrid({
  posts,
  emptyText,
  onOpen,
}: {
  posts: Post[];
  emptyText: string;
  onOpen: (post: Post) => void;
}) {
  const c = useTheme();
  const t = useType();

  if (posts.length === 0) {
    return <Text style={[t.caption, { color: c.textSecondary }]}>{emptyText}</Text>;
  }

  return (
    <View style={styles.grid}>
      {posts.map((p) => {
        const cover = p.imagePaths[0] ? postImageUrl(p.imagePaths[0]) : null;
        return (
          <Pressable
            key={p.id}
            onPress={() => onOpen(p)}
            accessibilityRole="button"
            accessibilityLabel={p.body ? `글: ${p.body.slice(0, 30)}` : '사진 글'}
            style={({ pressed }) => [
              styles.cell,
              { backgroundColor: c.backgroundElement, borderColor: c.border },
              pressed && styles.pressed,
            ]}>
            {cover ? (
              <Image
                source={{ uri: cover }}
                style={styles.cellImage}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View
                style={[
                  styles.cellImage,
                  styles.cellTextBox,
                  { backgroundColor: c.backgroundSelected },
                ]}>
                <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={5}>
                  {p.body}
                </Text>
              </View>
            )}
            {/* 사진이 여러 장이면 모서리에 표시한다 — 들어가 봐야 알면 넘겨 볼 생각을 못 한다. */}
            {p.imagePaths.length > 1 && (
              <View style={styles.multi}>
                <Icon name="image" size={13} color="#fff" />
              </View>
            )}
            {/* 사진 위가 아니라 아래 띠에 얹는다 — 사진 위에 올리면 밝은 사진에서 안 보인다. */}
            <View style={[styles.cellMeta, { borderTopColor: c.border }]}>
              <Icon name="heart" size={13} color={c.textSecondary} filled={p.likeCount > 0} />
              <Text style={[styles.cellMetaText, { color: c.text }]}>{p.likeCount}</Text>
              {p.commentCount > 0 && (
                <>
                  <Icon name="message" size={13} color={c.textSecondary} />
                  <Text style={[styles.cellMetaText, { color: c.text }]}>{p.commentCount}</Text>
                </>
              )}
              <Text
                style={[
                  styles.cellMetaText,
                  { color: c.textSecondary, flex: 1, textAlign: 'right' },
                ]}
                numberOfLines={1}>
                {timeAgo(p.createdAt)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { alignItems: 'center', gap: 2, minWidth: 0 },
  statLabel: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  pressed: { opacity: 0.7 },
  record: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recordTop: { flexDirection: 'row', gap: Spacing.five, flexWrap: 'wrap' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: { flex: 1 },
  recent: { gap: 0 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentThumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentText: { flex: 1, minWidth: 0, gap: 1 },
  moreLink: { minHeight: TouchTarget.min, justifyContent: 'center', alignSelf: 'flex-start' },
  games: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  gameCell: { width: '23%', gap: 4 },
  gameCover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishBand: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 1 },
  wishText: { ...Typography.caption, fontWeight: '700', textAlign: 'center' },
  gameTitle: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: {
    width: '31.5%',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cellImage: { width: '100%', aspectRatio: 1 },
  cellTextBox: { padding: Spacing.two, justifyContent: 'center' },
  multi: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    padding: 3,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
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
