import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { SearchBar } from '@/components/search-bar';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useMyProfile } from '@/features/community/hooks';
import { useGames } from '@/features/games/hooks';
import { gameImageUrl } from '@/features/games/images';
import { useGameLikes } from '@/features/games/likes';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/** 목록이 이 폭을 넘지 않는다. 표지가 한 줄에 너무 많이 늘어서면 하나씩 보기 어렵다. */
const GRID_MAX = 720;
/** 표지가 이보다 작아지면 무슨 게임인지 알아보기 어렵다. */
const TARGET_CARD = 150;

/**
 * 가입 직후 딱 한 번 뜨는 첫 안내.
 *
 * 묻는 건 하나뿐이다 — **좋아하는 게임에 하트**. 프로필 사진이나 소개는 나중에 해도 되지만
 * 하트는 다르다. 몇 개만 있어도 그날부터 추천이 그 사람에게 맞기 시작하고, 모임에 갔을 때
 * "이 사람이 하고 싶어 하는 게임"이 위로 올라온다. 첫 화면에서 얻어낼 값이 가장 큰 정보다.
 *
 * 개수를 강요하지 않는다. 0개도, 1개도, 10개도 좋다 — 취향을 숙제로 만들면 아무 데나 누르고
 * 넘어가고, 그렇게 들어온 하트는 추천을 오히려 망친다.
 */
export function Onboarding() {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const { profile, save } = useMyProfile();
  const { all, loading } = useGames();
  const likes = useGameLikes();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);

  /**
   * 열 수를 **실제 그리드 폭**에서 뽑는다.
   *
   * 화면 전체 폭으로 계산하면 안 된다 — 이 목록은 GRID_MAX에 묶여 있어서, 넓은 화면에서는
   * 한 줄에 들어가지 못한 카드가 다음 줄로 밀리고 오른쪽이 한 칸씩 비게 된다.
   *
   * 화면 그리드들이 쓰는 useGridColumns를 쓰지 않는 이유가 둘이다:
   *   1) 그 훅은 #root의 CSS zoom을 보정하는데, Modal은 #root **바깥**에 그려져 zoom이 없다.
   *   2) 상한(maxWidth)이 걸린 컨테이너를 다루지 않는다.
   */
  const { width: windowWidth } = useWindowDimensions();
  const inner = Math.min(windowWidth, GRID_MAX) - Spacing.four * 2;
  const columns = Math.max(2, Math.floor(inner / TARGET_CARD));
  const cardWidth = Math.floor((inner - Spacing.two * (columns - 1)) / columns);

  /**
   * 많이 한 순으로 낸다. 처음 온 사람에게 150개를 제목순으로 들이밀면 아는 이름이
   * 언제 나올지 몰라 끝까지 훑게 된다. 모임이 자주 하는 게임이 앞에 있어야
   * "아 이거 해봤지"가 빨리 나온다.
   */
  const games = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle
      ? all.filter(
          (g) =>
            g.titleKo.toLowerCase().includes(needle) ||
            (g.titleEn ?? '').toLowerCase().includes(needle),
        )
      : all;
    return [...pool].sort(
      (a, b) => b.playCount - a.playCount || a.titleKo.localeCompare(b.titleKo, 'ko'),
    );
  }, [all, query]);

  const picked = all.filter((g) => likes.mine(g.id)).length;
  // 제목 칸을 정확히 두 줄로 고정한다. 한 줄짜리와 두 줄짜리가 섞이면 카드 높이가 달라져
  // 줄마다 아래가 들쭉날쭉해진다. 글자 크기는 화면 폭에 따라 바뀌므로 거기서 끌어온다.
  const lineHeight = Math.round((t.caption.fontSize ?? 12) * 1.35);

  const finish = async () => {
    setPending(true);
    try {
      await save({ onboarded: true });
    } finally {
      setPending(false);
    }
  };

  // 회원이 아니거나 이미 본 사람에게는 아예 그리지 않는다.
  if (!profile || !profile.needsOnboarding) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={() => void finish()}>
      <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <View style={styles.head}>
          <Icon name="heart" size={32} color={c.accent} filled />
          <Text style={[t.title, styles.title, { color: c.text }]}>
            {profile.displayName}님, 반가워요
          </Text>
          <Text style={[t.body, styles.lead, { color: c.textSecondary }]}>
            좋아하는 게임에 하트를 눌러 주세요. 모임에서 &lsquo;오늘 뭐 할까&rsquo;를 고를 때
            여러분이 하고 싶어 하는 게임이 먼저 보입니다.
          </Text>
          <Text style={[t.caption, styles.lead, { color: c.textSecondary }]}>
            몇 개를 고르든 상관없어요. 나중에 게임 화면에서 언제든 바꿀 수 있습니다.
          </Text>
          <SearchBar value={query} onChange={setQuery} placeholder="게임 이름 검색" />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.grid}>
            {loading && (
              <Text style={[t.caption, { color: c.textSecondary }]}>게임 목록을 불러오는 중…</Text>
            )}
            {games.map((g) => {
              const liked = likes.mine(g.id);
              const url = gameImageUrl(g);
              return (
                <Pressable
                  key={g.id}
                  onPress={() => void likes.toggle(g.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: liked }}
                  accessibilityLabel={`${g.titleKo}${liked ? ' 하트 취소' : ' 하트'}`}
                  style={[
                    styles.card,
                    {
                      width: cardWidth,
                      borderColor: liked ? c.accent : 'transparent',
                      backgroundColor: c.backgroundElement,
                    },
                  ]}>
                  <View style={[styles.cover, { backgroundColor: c.backgroundSelected }]}>
                    {url ? (
                      <Image
                        source={{ uri: url }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={120}
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <Text style={[t.title, { color: c.textSecondary }]} numberOfLines={1}>
                        {g.titleKo.slice(0, 2)}
                      </Text>
                    )}
                    {/* 고른 것이 한눈에 보여야 한다 — 표지 위에 하트를 덧대 표시한다. */}
                    {liked && (
                      <View style={[styles.mark, { backgroundColor: c.accent }]}>
                        <Icon name="heart" size={14} color={c.onAccent} filled />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      t.caption,
                      styles.name,
                      // RN의 height는 padding을 포함한다 — 그대로 두 줄만큼만 주면 둘째 줄이 잘린다.
                      { color: c.text, lineHeight, height: lineHeight * 2 + Spacing.two },
                    ]}
                    numberOfLines={2}>
                    {g.titleKo}
                  </Text>
                </Pressable>
              );
            })}
            {!loading && games.length === 0 && (
              <Text style={[t.caption, { color: c.textSecondary }]}>찾는 게임이 없어요.</Text>
            )}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            { borderTopColor: c.border, paddingBottom: insets.bottom + Spacing.three },
          ]}>
          <Text style={[t.caption, styles.count, { color: c.textSecondary }]}>
            {picked > 0 ? `${picked}개 골랐어요` : '아직 고른 게임이 없어요'}
          </Text>
          <Pressable
            onPress={() => void finish()}
            disabled={pending}
            accessibilityRole="button"
            style={[styles.done, { backgroundColor: c.accent, opacity: pending ? 0.5 : 1 }]}>
            <Text style={[t.body, styles.doneText, { color: c.onAccent }]}>
              {pending ? '저장하는 중…' : picked > 0 ? '시작하기' : '건너뛰기'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    maxWidth: GRID_MAX,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontWeight: '700' },
  lead: { lineHeight: 22 },
  scroll: {
    padding: Spacing.four,
    paddingTop: 0,
    maxWidth: GRID_MAX,
    width: '100%',
    alignSelf: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: { borderRadius: Radius.md, borderWidth: 2, overflow: 'hidden' },
  cover: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  mark: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    padding: 4,
    borderRadius: Radius.full,
  },
  name: { paddingHorizontal: Spacing.one, paddingVertical: Spacing.one, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxWidth: GRID_MAX,
    width: '100%',
    alignSelf: 'center',
  },
  count: { flex: 1 },
  done: {
    minHeight: TouchTarget.primary,
    justifyContent: 'center',
    paddingHorizontal: Spacing.six,
    borderRadius: Radius.full,
  },
  doneText: { fontWeight: '700' },
});
