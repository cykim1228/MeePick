import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  onPress: () => void;
};

export function GameCard({ game, playerCount, selected = false, onPress }: Props) {
  const c = useTheme();
  const fit = playerCount === null ? null : playerFit(game, playerCount);
  const neglect = neglectOf(game);
  const imageUrl = gameImageUrl(game);
  const playing = useActiveGameId() === game.id;

  const fitLabel =
    fit === 'best' ? `${playerCount}인 베스트` : fit === 'recommended' ? `${playerCount}인 추천` : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${game.titleKo}, ${playerLabel(game)}, ${playtimeLabel(game.minPlaytime, game.maxPlaytime)}`}
      style={({ pressed }) => [
        styles.card,
        Shadow.card,
        {
          backgroundColor: c.backgroundElement,
          borderColor: selected ? c.accent : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
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
          <View style={[styles.coverBadge, { backgroundColor: c.accent, borderColor: c.background }]}>
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
  body: { gap: Spacing.one, padding: Spacing.three },
  title: { ...Typography.subtitle },
  meta: { ...Typography.caption },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  tagText: { ...Typography.caption },
});
