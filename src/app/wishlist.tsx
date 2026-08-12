import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterModal } from '@/components/center-modal';
import { GameCard } from '@/components/game-card';
import { GameDetail } from '@/components/game-detail';
import { GameForm } from '@/components/game-form';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Spacing, Typography } from '@/constants/theme';
import { useGames, useWishlist } from '@/features/games/hooks';
import { countBy } from '@/features/games/recommend';
import type { Game } from '@/features/games/types';
import { useGridColumns } from '@/hooks/use-grid-columns';
import { useTheme } from '@/hooks/use-theme';

/**
 * 위시리스트 — 노션 '상태'가 미소장인 게임들.
 * 추천·전체 탭은 소장만 다루므로, 사고 싶은 게임은 여기서만 보인다.
 * 구매하면 수정에서 '지금 집에 있음'을 켜는 것으로 소장 목록으로 옮긴다.
 */
export default function WishlistScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { columns, width, onLayout } = useGridColumns(200);
  const cardWidth = Math.floor(
    (width - Spacing.four * 2 - Spacing.three * (columns - 1)) / columns
  );

  const { games, loading, error, reload } = useWishlist();
  // 폼의 카테고리 선택지는 소장 목록의 실제 분포에서 뽑는다.
  const { all: owned } = useGames();
  const categoryOptions = useMemo(() => countBy(owned, 'categories').map(([v]) => v), [owned]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Game | null>(null);
  const selected = useMemo(() => games.find((g) => g.id === selectedId) ?? null, [games, selectedId]);

  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <ErrorView message={error} onRetry={() => void reload()} />
      </View>
    );
  }

  return (
    <View
      style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}
      onLayout={onLayout}>
      <FlatList
        key={`grid-${columns}`}
        numColumns={columns}
        data={games}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.h1, { color: c.text }]}>위시리스트</Text>
            <Text style={[styles.sub, { color: c.textSecondary }]}>
              아직 집에 없는 게임들. 사 오면 수정에서 &lsquo;지금 집에 있음&rsquo;을 켜세요.
            </Text>
          </View>
        }
        columnWrapperStyle={columns > 1 ? styles.column : undefined}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.six }]}
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <GameCard
              game={item}
              playerCount={null}
              selected={item.id === selectedId}
              onPress={() => setSelectedId(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <LoadingView />
          ) : (
            <EmptyView
              title="위시리스트가 비어 있어요"
              hint="노션에서 상태를 '미소장'으로 두거나, 게임 추가에서 '지금 집에 있음'을 끄면 여기에 모입니다."
            />
          )
        }
      />

      <CenterModal visible={!!selected} onClose={() => setSelectedId(null)}>
        {selected && (
          <GameDetail
            game={selected}
            playerCount={null}
            onClose={() => setSelectedId(null)}
            onEdit={() => setEditing(selected)}
          />
        )}
      </CenterModal>

      {editing && (
        <GameForm
          key={editing.id}
          visible
          game={editing}
          categoryOptions={categoryOptions}
          onClose={() => setEditing(null)}
          // 소장으로 바뀌면 이 목록에서 빠져야 하므로 저장·삭제 후 다시 불러온다.
          onSaved={() => {
            setSelectedId(null);
            void reload();
          }}
          onDeleted={() => {
            setSelectedId(null);
            void reload();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { gap: Spacing.two, paddingBottom: Spacing.four },
  h1: { ...Typography.display },
  sub: { ...Typography.body },
  listContent: { padding: Spacing.four, gap: Spacing.three },
  column: { gap: Spacing.three },
});
