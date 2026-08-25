import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Shadow, Spacing, Typography } from '@/constants/theme';
import { gameImageUrl } from '@/features/games/images';
import { useActiveGameId } from '@/features/plays/hooks';
import {
  neglectOf,
  playerFit,
  playerLabel,
  playtimeLabel,
  weightLabel,
} from '@/features/games/recommend';
import type { Game } from '@/features/games/types';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  game: Game;
  /** 현재 선택된 인원. 있으면 이 인원 기준 적합도를 표지 위에 표시한다. */
  playerCount: number | null;
  selected?: boolean;
  /** 내가 하트를 눌렀는가. onToggleLike가 없으면 하트 자체를 그리지 않는다. */
  liked?: boolean;
  /** 이 게임에 하트를 누른 사람 수 */
  likeCount?: number;
  onPress: () => void;
  onToggleLike?: () => void;
};

export function GameCard({
  game,
  playerCount,
  selected = false,
  liked = false,
  likeCount = 0,
  onPress,
  onToggleLike,
}: Props) {
  const c = useTheme();
  const fit = playerCount === null ? null : playerFit(game, playerCount);
  const neglect = neglectOf(game);
  const imageUrl = gameImageUrl(game);
  const playing = useActiveGameId() === game.id;

  const fitLabel =
    fit === 'best'
      ? `${playerCount}인 베스트`
      : fit === 'recommended'
        ? `${playerCount}인 추천`
        : null;

  return (
    /* 하트는 카드 열기와 겹치면 안 되는 별개의 버튼이다. 카드 Pressable 안에 넣으면
       웹에서 <button> 안의 <button>이 되어 잘못된 HTML이 된다(브라우저가 경고한다).
       그래서 바깥은 그냥 View로 두고, 카드 본문과 하트를 나란히 놓는다. */
    <View
      style={[
        styles.card,
        Shadow.card,
        {
          backgroundColor: c.backgroundElement,
          borderColor: selected ? c.accent : 'transparent',
        },
      ]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${game.titleKo}, ${playerLabel(game)}, ${playtimeLabel(game.minPlaytime, game.maxPlaytime)}`}
        style={({ pressed }) => [styles.pressArea, { opacity: pressed ? 0.85 : 1 }]}>
        {/* 표지가 있는 게임이 92종, 없는 게 63종이다. 비워두면 카드 높이가 들쭉날쭉해지므로
          없을 때는 제목 앞글자로 자리를 채워 격자를 유지한다. */}
        <View style={[styles.cover, { backgroundColor: c.backgroundSelected }]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text style={[styles.coverFallback, { color: c.textSecondary }]} numberOfLines={1}>
              {game.titleKo.slice(0, 2)}
            </Text>
          )}

          {/* 표지 위 배지는 하나만 — 게임중이 인원 적합도보다 우선한다.
            베스트(그린)와 추천(블루)은 색으로 구분하고, 표지 위에서 묻히지 않게 테두리를 두른다. */}
          {playing ? (
            <View
              style={[styles.coverBadge, { backgroundColor: c.accent, borderColor: c.background }]}>
              <Text style={[styles.coverBadgeText, { color: c.onAccent }]}>게임중</Text>
            </View>
          ) : (
            fitLabel && (
              <View
                style={[
                  styles.coverBadge,
                  {
                    backgroundColor: fit === 'best' ? c.badgeBest : c.badgeRecommended,
                    borderColor: c.background,
                  },
                ]}>
                <Text style={[styles.coverBadgeText, { color: c.background }]}>{fitLabel}</Text>
              </View>
            )
          )}
        </View>

        <View style={styles.body}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
            {game.titleKo}
          </Text>

          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
            {playerLabel(game)} · {playtimeLabel(game.minPlaytime, game.maxPlaytime)} ·{' '}
            {weightLabel(game.weight)}
          </Text>

          <View style={styles.tagRow}>
            {/* "아직 안 해봄" 대신 횟수를 그대로. 0회는 앰버로 남겨 발굴 대상임을 유지한다. */}
            <Tag
              label={`${game.playCount}회`}
              color={game.playCount === 0 ? c.badgeNew : c.textSecondary}
            />
            {neglect === 'long' && <Tag label="오랜만" color={c.badgeNew} />}
            {game.isEstimated && <Tag label="추정" color={c.badgeEstimated} />}
            {game.categories.slice(0, 2).map((cat) => (
              <Tag key={cat} label={cat} color={c.textSecondary} />
            ))}
          </View>
        </View>
      </Pressable>

      {/* 표지 오른쪽 위. 사진 밝기를 알 수 없으니 어두운 알약을 깔아 대비를 만든다. */}
      {onToggleLike && (
        <Pressable
          onPress={onToggleLike}
          accessibilityRole="button"
          accessibilityLabel={liked ? `${game.titleKo} 하트 취소` : `${game.titleKo} 하트`}
          hitSlop={8}
          style={styles.likeButton}>
          <Icon name="heart" size={16} color={liked ? c.danger : '#fff'} filled={liked} />
          {likeCount > 0 && <Text style={styles.likeCount}>{likeCount}</Text>}
        </Pressable>
      )}
    </View>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // 폭은 부모(고정 폭 래퍼)가 정한다. flex:1로 두면 마지막 줄에 카드가 모자랄 때
    // 남은 폭을 나눠 먹어 카드마다 크기가 달라진다.
    width: '100%',
    borderRadius: Radius.lg,
    borderWidth: 2,
    // 표지가 카드 위쪽 모서리까지 꽉 차도록 자른다.
    overflow: 'hidden',
  },
  cover: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  coverFallback: { ...Typography.display },
  coverBadge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  coverBadgeText: { ...Typography.caption, fontWeight: '700' },
  pressArea: { width: '100%' },
  likeButton: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: Radius.full,
    // 팔레트가 아니라 고정 반투명 검정 — 표지가 밝든 어둡든 아이콘이 보여야 한다.
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  likeCount: { ...Typography.caption, color: '#fff', fontWeight: '700' },
  body: { gap: Spacing.one, padding: Spacing.three },
  title: { ...Typography.subtitle },
  meta: { ...Typography.caption },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  tagText: { ...Typography.caption },
});
