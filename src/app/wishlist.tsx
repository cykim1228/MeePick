import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterModal } from '@/components/center-modal';
import { GameCard } from '@/components/game-card';
import { GameDetail } from '@/components/game-detail';
import { Fab } from '@/components/fab';
import { GameForm } from '@/components/game-form';
import { ScreenTitle } from '@/components/screen-title';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Spacing } from '@/constants/theme';
import { useMyProfile } from '@/features/community/hooks';
import { useEditGame, useGames, useWishlist } from '@/features/games/hooks';
import { useGameLikes } from '@/features/games/likes';
import { countBy } from '@/features/games/recommend';
import type { Game } from '@/features/games/types';
import { useGridColumns } from '@/hooks/use-grid-columns';
import { gridKey, useGridRows } from '@/hooks/use-grid-rows';
import { useTheme } from '@/hooks/use-theme';

/**
 * 위시리스트 — 노션 '상태'가 미소장인 게임들.
 * 추천·전체 탭은 소장만 다루므로, 사고 싶은 게임은 여기서만 보인다.
 * 구매하면 수정에서 '지금 집에 있음'을 켜는 것으로 소장 목록으로 옮긴다.
 */
export default function WishlistScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { columns, onLayout } = useGridColumns(200);

  const { games: wishGames, loading, error, reload } = useWishlist();
  const likes = useGameLikes();
  // 위시리스트에서 하트는 곧 "이거 사요" 투표다. 표를 많이 받은 게 위에 있어야
  // 목록이 결정을 돕는다 — 제목순은 아무것도 말해 주지 않는다.
  const games = useMemo(
    () =>
      [...wishGames].sort(
        (a, b) =>
          likes.count(b.id) - likes.count(a.id) || a.titleKo.localeCompare(b.titleKo, 'ko')
      ),
    [wishGames, likes]
  );
  // 폼의 카테고리 선택지는 소장 목록의 실제 분포에서 뽑는다.
  const { all: owned } = useGames();
  const categoryOptions = useMemo(() => countBy(owned, 'categories').map(([v]) => v), [owned]);
  const themeOptions = useMemo(() => countBy(owned, 'themes').map(([v]) => v), [owned]);
  const mechanicOptions = useMemo(() => countBy(owned, 'mechanics').map(([v]) => v), [owned]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Game | null>(null);
  const [adding, setAdding] = useState(false);
  const selected = useMemo(() => games.find((g) => g.id === selectedId) ?? null, [games, selectedId]);

  // 목록 수정은 모임장만 — 권한 없는 사람에게 버튼을 보여주면 눌러 놓고 저장에서 막힌다.
  const me = useMyProfile();
  const canEditGames = me.profile?.isAdmin ?? false;
  const { setOwned } = useEditGame();
  // 마지막 줄을 빈 칸으로 메워, 남은 카드가 줄 전체로 늘어나지 않게 한다.
  const cells = useGridRows(games, columns);

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
        data={cells}
        keyExtractor={gridKey}
        ListHeaderComponent={
          <ScreenTitle
            title="위시리스트"
            subtitle="사고 싶은 게임에 하트를 눌러 주세요. 표 많은 순입니다."
          />
        }
        columnWrapperStyle={columns > 1 ? styles.column : undefined}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.six }]}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            {item && (
              <GameCard
                game={item}
                playerCount={null}
                selected={item.id === selectedId}
                liked={likes.mine(item.id)}
                likeCount={likes.count(item.id)}
                onPress={() => setSelectedId(item.id)}
                onToggleLike={me.isMember ? () => void likes.toggle(item.id) : undefined}
              />
            )}
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
            onEdit={canEditGames ? () => setEditing(selected) : undefined}
            onMarkOwned={
              canEditGames
                ? () =>
                    void setOwned(selected.id, true).then(() => {
                      setSelectedId(null);
                      void reload();
                    })
                : undefined
            }
          />
        )}
      </CenterModal>

      {/* 위시리스트 추가는 회원 누구나 — "이거 사고 싶다"는 의견이고, 의견을 내는 데
          허락이 필요하면 아무도 안 낸다. 소장 목록으로 옮기는 것만 모임장 몫이다. */}
      {me.isMember && (
        <Fab
          icon="plus"
          label="게임"
          accessibilityLabel="위시리스트에 게임 추가"
          onPress={() => setAdding(true)}
        />
      )}

      {adding && (
        <GameForm
          visible
          game={null}
          categoryOptions={categoryOptions}
          themeOptions={themeOptions}
          mechanicOptions={mechanicOptions}
          // 위시리스트에서 추가하므로 '지금 집에 있음'은 꺼진 채로 시작한다.
          // 나중에 사면 수정에서 켜는 것으로 소장 목록으로 옮겨진다.
          defaultOwned={false}
          // 일반 회원은 '지금 집에 있음'을 켤 수 없다 — 정책이 owned=false만 허용한다.
          wishOnly={!canEditGames}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void reload();
          }}
        />
      )}

      {editing && (
        <GameForm
          key={editing.id}
          visible
          game={editing}
          categoryOptions={categoryOptions}
          themeOptions={themeOptions}
          mechanicOptions={mechanicOptions}
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
  listContent: { padding: Spacing.four, gap: Spacing.three },
  column: { gap: Spacing.three },
  // 칸을 flex로 두면 줄이 언제나 정확히 채워진다 — 폭을 몇 픽셀 잘못 재도 여백이 남지 않는다.
  cell: { flex: 1 },
});
