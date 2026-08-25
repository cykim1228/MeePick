import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterModal } from '@/components/center-modal';
import { Chip } from '@/components/chip';
import { CollapsibleFilterSection } from '@/components/filter-section';
import { GameCard } from '@/components/game-card';
import { GameDetail } from '@/components/game-detail';
import { GameForm } from '@/components/game-form';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useMyProfile } from '@/features/community/hooks';
import { useGames } from '@/features/games/hooks';
import { useGameLikes } from '@/features/games/likes';
import { countBy, optionCounts } from '@/features/games/recommend';
import { EMPTY_FILTER, type Game, type GameFilter, type SortKey } from '@/features/games/types';
import { useGridColumns } from '@/hooks/use-grid-columns';
import { useTheme } from '@/hooks/use-theme';

/**
 * 테마가 53종인데 대부분 1개짜리라, 전부 칩으로 깔면 결과 1건짜리 버튼이 늘어선다.
 * 상위만 노출하고 나머지는 '더보기'로 접는다.
 */
const TOP_THEMES = 10;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: '추천순' },
  { key: 'mostLiked', label: '하트순' },
  { key: 'mostPlayed', label: '많이 한 순' },
  { key: 'longestUnplayed', label: '오랜만인 순' },
  { key: 'shortest', label: '짧은 순' },
  { key: 'easiest', label: '쉬운 순' },
];

export default function ExploreScreen() {
  const c = useTheme();
  // 게임 목록은 모임의 공용 자산이라 모임장만 고친다.
  const me = useMyProfile();
  const canEditGames = me.profile?.isAdmin ?? false;
  // 하트는 회원만 누른다. 비회원에게 버튼을 보여 주면 눌러 놓고 RLS에서 막힌다.
  const isMember = me.isMember;
  const likes = useGameLikes();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState<GameFilter>(EMPTY_FILTER);
  const [showAllThemes, setShowAllThemes] = useState(false);
  const [showAllMechanics, setShowAllMechanics] = useState(false);
  const [themeSectionOpen, setThemeSectionOpen] = useState(false);
  const [mechanicsSectionOpen, setMechanicsSectionOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** null = 닫힘, { game: null } = 추가, { game } = 수정 */
  const [editing, setEditing] = useState<{ game: Game | null } | null>(null);

  // 훑어보는 화면이라 추천 화면보다 카드를 조금 작게 잡아 한 눈에 더 많이 들어오게 한다.
  const { columns, width, onLayout } = useGridColumns(200);
  const cardWidth = Math.floor(
    (width - Spacing.four * 2 - Spacing.three * (columns - 1)) / columns
  );

  const { all, games, loading, error, reload } = useGames(filter);
  const selected = useMemo(() => all.find((g) => g.id === selectedId) ?? null, [all, selectedId]);

  const categories = useMemo(() => countBy(all, 'categories').map(([v]) => v), [all]);
  const themesAll = useMemo(() => countBy(all, 'themes').map(([v]) => v), [all]);
  const mechanicsAll = useMemo(() => countBy(all, 'mechanics').map(([v]) => v), [all]);
  const themes = showAllThemes ? themesAll : themesAll.slice(0, TOP_THEMES);
  const mechanics = showAllMechanics ? mechanicsAll : mechanicsAll.slice(0, TOP_THEMES);

  const categoryCounts = useMemo(
    () => optionCounts(all, filter, 'categories', categories),
    [all, filter, categories]
  );
  const themeCounts = useMemo(
    () => optionCounts(all, filter, 'themes', themes),
    [all, filter, themes]
  );
  const mechanicCounts = useMemo(
    () => optionCounts(all, filter, 'mechanics', mechanics),
    [all, filter, mechanics]
  );

  const toggle = (key: 'categories' | 'themes' | 'mechanics', value: string) =>
    setFilter((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const hasFilters =
    filter.categories.length > 0 ||
    filter.themes.length > 0 ||
    filter.mechanics.length > 0 ||
    filter.query.trim() !== '';

  const header = (
    <View style={styles.controls}>
      <TextInput
        value={filter.query}
        onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
        placeholder="게임 이름 검색"
        placeholderTextColor={c.textSecondary}
        style={[
          styles.search,
          { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
        ]}
      />

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>카테고리</Text>
      <View style={styles.chipRow}>
        {categories.map((v) => (
          <Chip
            key={v}
            label={v}
            selected={filter.categories.includes(v)}
            count={categoryCounts[v]}
            onPress={() => toggle('categories', v)}
          />
        ))}
      </View>

      <CollapsibleFilterSection
        label="테마"
        selectedCount={filter.themes.length}
        expanded={themeSectionOpen}
        onToggle={() => setThemeSectionOpen((v) => !v)}>
        <View style={styles.chipRow}>
          {themes.map((v) => (
            <Chip
              key={v}
              label={v}
              selected={filter.themes.includes(v)}
              count={themeCounts[v]}
              onPress={() => toggle('themes', v)}
            />
          ))}
          {themesAll.length > TOP_THEMES && (
            <Chip
              label={showAllThemes ? '접기' : `더보기 (${themesAll.length - TOP_THEMES})`}
              onPress={() => setShowAllThemes((v) => !v)}
            />
          )}
        </View>
      </CollapsibleFilterSection>

      <CollapsibleFilterSection
        label="메커니즘"
        selectedCount={filter.mechanics.length}
        expanded={mechanicsSectionOpen}
        onToggle={() => setMechanicsSectionOpen((v) => !v)}>
        <View style={styles.chipRow}>
          {mechanics.map((v) => (
            <Chip
              key={v}
              label={v}
              selected={filter.mechanics.includes(v)}
              count={mechanicCounts[v]}
              onPress={() => toggle('mechanics', v)}
            />
          ))}
          {mechanicsAll.length > TOP_THEMES && (
            <Chip
              label={showAllMechanics ? '접기' : `더보기 (${mechanicsAll.length - TOP_THEMES})`}
              onPress={() => setShowAllMechanics((v) => !v)}
            />
          )}
        </View>
      </CollapsibleFilterSection>

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>정렬</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {SORTS.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            selected={filter.sort === s.key}
            onPress={() => setFilter((f) => ({ ...f, sort: s.key }))}
          />
        ))}
      </ScrollView>

      <View style={styles.countRow}>
        <Text style={[styles.count, { color: c.textSecondary }]}>
          {loading ? '불러오는 중' : `${games.length} / ${all.length}개`}
        </Text>
        <View style={styles.countActions}>
          {hasFilters && (
            <Chip label="초기화" onPress={() => setFilter((f) => ({ ...EMPTY_FILTER, sort: f.sort }))} />
          )}
          {canEditGames && (
            <Chip label="＋ 게임 추가" onPress={() => setEditing({ game: null })} />
          )}
        </View>
      </View>
    </View>
  );

  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <ErrorView message={error} onRetry={reload} />
      </View>
    );
  }

  const list = (
    <FlatList
      key={`grid-${columns}`}
      numColumns={columns}
      data={games}
      keyExtractor={(g) => g.id}
      ListHeaderComponent={header}
      columnWrapperStyle={columns > 1 ? styles.column : undefined}
      contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.six }]}
      renderItem={({ item }) => (
        <View style={{ width: cardWidth }}>
          <GameCard
            game={item}
            playerCount={filter.playerCount}
            selected={item.id === selectedId}
            liked={likes.mine(item.id)}
            likeCount={likes.count(item.id)}
            onPress={() => setSelectedId(item.id)}
            onToggleLike={isMember ? () => void likes.toggle(item.id) : undefined}
          />
        </View>
      )}
      ListEmptyComponent={
        loading ? (
          <LoadingView />
        ) : (
          <EmptyView title="해당하는 게임이 없어요" hint="필터를 하나 빼보세요" />
        )
      }
    />
  );

  const form = editing && (
    // game이 바뀌면 폼 내부 상태를 초기화해야 하므로 key로 리마운트시킨다.
    <GameForm
      key={editing.game?.id ?? 'new'}
      visible
      game={editing.game}
      categoryOptions={categories}
      onClose={() => setEditing(null)}
      onSaved={(g) => setSelectedId(g.id)}
      onDeleted={() => setSelectedId(null)}
    />
  );

  return (
    <View
      style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}
      onLayout={onLayout}>
      {list}
      <CenterModal visible={!!selected} onClose={() => setSelectedId(null)}>
        {selected && (
          <GameDetail
            game={selected}
            playerCount={filter.playerCount}
            onClose={() => setSelectedId(null)}
            onEdit={canEditGames ? () => setEditing({ game: selected }) : undefined}
          />
        )}
      </CenterModal>
      {form}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: Spacing.four, gap: Spacing.three },
  column: { gap: Spacing.three },
  controls: { gap: Spacing.two, paddingBottom: Spacing.four },
  search: {
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  groupLabel: { ...Typography.label, marginTop: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingRight: Spacing.three },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  countActions: { flexDirection: 'row', gap: Spacing.two },
  count: { ...Typography.body, flexShrink: 1 },
});
