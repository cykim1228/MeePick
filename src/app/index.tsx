import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { GameCard } from '@/components/game-card';
import { CenterModal } from '@/components/center-modal';
import { CollapsibleFilterSection } from '@/components/filter-section';
import { GameDetail } from '@/components/game-detail';
import { GameForm } from '@/components/game-form';
import { PlaySheet } from '@/components/play-sheet';
import { SessionSetup } from '@/components/session-setup';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useGames } from '@/features/games/hooks';
import { countBy, optionCounts, relaxations } from '@/features/games/recommend';
import { EMPTY_FILTER, type Game, type GameFilter, type SortKey } from '@/features/games/types';
import { usePlayHistory, useSession } from '@/features/plays/hooks';
import { computeStandings } from '@/features/plays/stats';
import { useElapsedMinutes } from '@/hooks/use-elapsed-minutes';
import { useGridColumns } from '@/hooks/use-grid-columns';
import { useTheme } from '@/hooks/use-theme';
import { localDateOf, localToday } from '@/lib/dates';

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TIME_OPTIONS: { label: string; value: number }[] = [
  { label: '30분 이내', value: 30 },
  { label: '1시간', value: 60 },
  { label: '2시간', value: 120 },
];
const WEIGHT_OPTIONS: { label: string; value: [number, number] }[] = [
  { label: '가볍게', value: [1, 2] },
  { label: '적당히', value: [2, 3] },
  { label: '묵직하게', value: [3, 5] },
];

/** 테마 53종·메커니즘 80종은 롱테일이라 상위만 깔고 나머지는 더보기로 접는다. */
const TOP_OPTIONS = 8;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: '추천순' },
  { key: 'mostPlayed', label: '많이 한 순' },
  { key: 'longestUnplayed', label: '오랜만인 순' },
];

export default function RecommendScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();

  const [filter, setFilter] = useState<GameFilter>(EMPTY_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Game | null>(null);
  const [changingMembers, setChangingMembers] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmEndSession, setConfirmEndSession] = useState(false);
  /** 모임 마무리 리캡 — 세션을 닫기 직전에 데이터를 붙잡아 팝업으로 보여준다 */
  const [recap, setRecap] = useState<{ count: number; winners: string; minutes: number } | null>(
    null
  );
  const [showAllThemes, setShowAllThemes] = useState(false);
  const [showAllMechanics, setShowAllMechanics] = useState(false);
  // 옵션이 많은 축은 기본 접힘 — 펼쳐두면 필터 영역이 목록을 밀어낸다.
  const [themeSectionOpen, setThemeSectionOpen] = useState(false);
  const [mechanicsSectionOpen, setMechanicsSectionOpen] = useState(false);

  const { columns, width, onLayout } = useGridColumns(240);
  // 마지막 줄에 카드가 모자라도 크기가 같도록 폭을 고정 계산한다. flex 분배에 맡기면 늘어난다.
  const cardWidth = Math.floor(
    (width - Spacing.four * 2 - Spacing.three * (columns - 1)) / columns
  );

  const { all, games, loading, error, reload } = useGames(filter);
  const selected = useMemo(() => games.find((g) => g.id === selectedId) ?? null, [games, selectedId]);
  const categoryOptions = useMemo(() => countBy(all, 'categories').map(([v]) => v), [all]);
  const alternatives = useMemo(
    () => (games.length === 0 && !loading ? relaxations(all, filter) : []),
    [all, filter, games.length, loading]
  );

  const activeGame = useMemo(
    () => (session.activePlay ? all.find((g) => g.id === session.activePlay?.gameId) ?? null : null),
    [all, session.activePlay]
  );

  const playElapsed = useElapsedMinutes(session.activePlay?.startedAt);

  // 오늘의 요약 — 판이 끝나면(usePlayHistory가 activePlay 변화에 반응) 자동 갱신된다.
  const { plays: allPlays } = usePlayHistory();
  const todaySummary = useMemo(() => {
    const today = localToday();
    const todayPlays = allPlays.filter((p) => p.endedAt && localDateOf(p.endedAt) === today);
    if (!todayPlays.length) return null;
    const winners = computeStandings(todayPlays, session.members)
      .filter((s) => s.roundWins > 0)
      .slice(0, 3);
    return { count: todayPlays.length, winners };
  }, [allPlays, session.members]);

  const categories = useMemo(() => countBy(all, 'categories').map(([v]) => v), [all]);
  const themesAll = useMemo(() => countBy(all, 'themes').map(([v]) => v), [all]);
  const mechanicsAll = useMemo(() => countBy(all, 'mechanics').map(([v]) => v), [all]);
  const themes = showAllThemes ? themesAll : themesAll.slice(0, TOP_OPTIONS);
  const mechanics = showAllMechanics ? mechanicsAll : mechanicsAll.slice(0, TOP_OPTIONS);

  const categoryCounts = useMemo(
    () => optionCounts(all, filter, 'categories', categories),
    [all, filter, categories]
  );
  const themeCounts = useMemo(() => optionCounts(all, filter, 'themes', themes), [all, filter, themes]);
  const mechanicCounts = useMemo(
    () => optionCounts(all, filter, 'mechanics', mechanics),
    [all, filter, mechanics]
  );

  const toggleTag = (key: 'categories' | 'themes' | 'mechanics', value: string) =>
    setFilter((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  // 인원만 남기고 나머지 분류를 전부 비운다.
  const hasExtraFilters =
    filter.maxPlaytime !== null ||
    filter.weightRange !== null ||
    filter.categories.length > 0 ||
    filter.themes.length > 0 ||
    filter.mechanics.length > 0 ||
    filter.query.trim() !== '';
  const resetFilters = () =>
    setFilter({ ...EMPTY_FILTER, playerCount: filter.playerCount, sort: filter.sort });

  // 실제 세션 종료 — 리캡 팝업을 닫을 때(또는 오늘 판이 없으면 즉시) 호출된다.
  const finalizeSession = () => {
    setRecap(null);
    if (session.endSession()) {
      // 지난 모임의 인원이 필터에 남지 않게 초기화. 새 멤버를 고르면 다시 채워진다.
      setFilter((f) => ({ ...f, playerCount: null }));
    }
  };

  // 모임 마무리 — 2탭 확인 후, 오늘 판이 있으면 리캡을 먼저 보여준다.
  const endSession = () => {
    if (!confirmEndSession) {
      setConfirmEndSession(true);
      return;
    }
    setConfirmEndSession(false);

    if (!todaySummary) {
      finalizeSession();
      return;
    }
    const today = localToday();
    // 총 플레이 시간 — 빠른 기록(0분)과 비정상 값은 제외
    const minutes = allPlays
      .filter((p) => p.endedAt && localDateOf(p.endedAt) === today)
      .reduce((sum, p) => {
        const m = Math.round(
          (new Date(p.endedAt as string).getTime() - new Date(p.startedAt).getTime()) / 60000
        );
        return sum + (m >= 1 && m <= 720 ? m : 0);
      }, 0);
    setRecap({
      count: todaySummary.count,
      winners: todaySummary.winners
        .map((w, i) => `${i === 0 ? '🏆 ' : ''}${w.member.name} ${w.roundWins}승`)
        .join(' · '),
      minutes,
    });
  };

  // 오늘의 멤버가 정해지면 인원 필터가 그 수를 따라간다. 칩으로 언제든 덮어쓸 수 있다.
  const sessionKey = session.memberIds.join(',');
  useEffect(() => {
    const count = session.memberIds.length;
    if (count > 0) setFilter((f) => ({ ...f, playerCount: Math.min(count, 10) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const patch = (next: Partial<GameFilter>) => setFilter((f) => ({ ...f, ...next }));

  /* ── 세션 게이트 — 게임 목록 전에 오늘의 멤버부터 ── */
  if (!session.ready) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <LoadingView label="세션 확인 중" />
      </View>
    );
  }
  // 세션 에러(마이그레이션 미실행 등)는 게임 목록 열람까지 막을 이유가 없다.
  // 게이트만 건너뛰고 안내 배너로 보여준다.
  if (session.memberIds.length === 0 && !session.skippedGate && !session.error) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <SessionSetup
          initialIds={[]}
          onConfirm={(ids) => void session.setMemberIds(ids)}
          onSkip={session.skipGate}
        />
      </View>
    );
  }

  const header = (
    <View style={styles.controls}>
      {session.error && (
        <Pressable
          onPress={() => void session.reload()}
          accessibilityRole="button"
          style={[styles.sessionBar, { backgroundColor: c.backgroundElement, borderColor: c.danger }]}>
          <Text style={[styles.caption, { color: c.danger, flex: 1 }]} numberOfLines={3}>
            플레이 기록 기능을 쓸 수 없습니다: {session.error}
          </Text>
          <Text style={[styles.caption, { color: c.accent, fontWeight: '600' }]}>재시도</Text>
        </Pressable>
      )}

      {/* 오늘의 멤버 바 — 멤버가 없어도(둘러보기) 항상 보여, 언제든 세션을 시작할 수 있다.
          숨기면 '둘러볼게요'를 누른 뒤 멤버를 고를 진입점이 사라진다. */}
      {!session.error && (
        <View style={[styles.sessionBar, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <Text
            style={[
              styles.sessionText,
              { color: session.memberIds.length ? c.text : c.textSecondary },
            ]}
            numberOfLines={1}>
            {session.memberIds.length ? (
              <>
                {session.sessionMembers.map((m) => m.name).join(' · ')}
                <Text style={{ color: c.textSecondary }}> · {session.memberIds.length}명</Text>
              </>
            ) : (
              '멤버 없이 둘러보는 중'
            )}
          </Text>
          <Pressable
            onPress={() => setChangingMembers(true)}
            accessibilityRole="button"
            style={styles.sessionChange}>
            <Text style={[styles.caption, { color: c.accent, fontWeight: '600' }]}>
              {session.memberIds.length ? '변경' : '멤버 선택'}
            </Text>
          </Pressable>
          {session.memberIds.length > 0 && !session.activePlay && (
            <Pressable onPress={endSession} accessibilityRole="button" style={styles.sessionChange}>
              <Text
                style={[
                  styles.caption,
                  { color: confirmEndSession ? c.danger : c.textSecondary, fontWeight: '600' },
                ]}>
                {confirmEndSession ? '정말 마무리?' : '마무리'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {session.actionError && (
        <Text style={[styles.caption, { color: c.danger }]}>{session.actionError}</Text>
      )}

      {/* 게임중 배너 — 어느 게임이든 진행 중이면 여기서 바로 기록으로 간다 */}
      {session.activePlay && (
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          style={[styles.playingBanner, { backgroundColor: c.accent }]}>
          <Text style={[styles.playingText, { color: c.onAccent }]} numberOfLines={1}>
            🎲 게임중 — {activeGame?.titleKo ?? '기록 보기'}
            {playElapsed !== null && playElapsed >= 1 ? ` · ${playElapsed}분째` : ''}
          </Text>
          <Text style={[styles.caption, { color: c.onAccent }]}>기록하기 ›</Text>
        </Pressable>
      )}

      {/* 오늘의 요약 + 모임 마무리 */}
      {todaySummary && (
        <View style={[styles.todayCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <View style={styles.todayBody}>
            <Text style={[styles.todayTitle, { color: c.text }]}>오늘 {todaySummary.count}판</Text>
            {todaySummary.winners.length > 0 && (
              <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={1}>
                {todaySummary.winners
                  .map((w, i) => `${i === 0 ? '🏆 ' : ''}${w.member.name} ${w.roundWins}승`)
                  .join(' · ')}
              </Text>
            )}
          </View>
          {session.memberIds.length > 0 && !session.activePlay && (
            <Pressable
              onPress={endSession}
              accessibilityRole="button"
              style={[
                styles.endSessionButton,
                { borderColor: confirmEndSession ? c.danger : c.border },
              ]}>
              <Text
                style={[
                  styles.caption,
                  { color: confirmEndSession ? c.danger : c.text, fontWeight: '600' },
                ]}>
                {confirmEndSession ? '정말 마무리할까요?' : '모임 마무리 🎉'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={[styles.h1, { color: c.text }]}>오늘 뭐 할까?</Text>
      <Text style={[styles.sub, { color: c.textSecondary }]}>
        조건을 고르면 지금 하기 좋은 순서로 보여드려요.
      </Text>

      <TextInput
        value={filter.query}
        onChangeText={(query) => patch({ query })}
        placeholder="게임 이름 검색"
        placeholderTextColor={c.textSecondary}
        style={[
          styles.search,
          { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
        ]}
      />

      {/* 인원수는 사용자가 가장 확실히 아는 값이므로 항상 노출되는 1차 필터로 둔다. */}
      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>몇 명이서?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {PLAYER_OPTIONS.map((n) => (
          <Chip
            key={n}
            label={n === 10 ? '10명+' : `${n}명`}
            selected={filter.playerCount === n}
            onPress={() => patch({ playerCount: filter.playerCount === n ? null : n })}
          />
        ))}
      </ScrollView>

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>시간</Text>
      <View style={styles.chipRow}>
        {TIME_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={filter.maxPlaytime === o.value}
            onPress={() => patch({ maxPlaytime: filter.maxPlaytime === o.value ? null : o.value })}
          />
        ))}
      </View>

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>난이도</Text>
      <View style={styles.chipRow}>
        {WEIGHT_OPTIONS.map((o) => {
          const on = filter.weightRange?.[0] === o.value[0] && filter.weightRange?.[1] === o.value[1];
          return (
            <Chip
              key={o.label}
              label={o.label}
              selected={on}
              onPress={() => patch({ weightRange: on ? null : o.value })}
            />
          );
        })}
      </View>

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>카테고리</Text>
      <View style={styles.chipRow}>
        {categories.map((v) => (
          <Chip
            key={v}
            label={v}
            selected={filter.categories.includes(v)}
            count={categoryCounts[v]}
            onPress={() => toggleTag('categories', v)}
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
              onPress={() => toggleTag('themes', v)}
            />
          ))}
          {themesAll.length > TOP_OPTIONS && (
            <Chip
              label={showAllThemes ? '접기' : `더보기 (${themesAll.length - TOP_OPTIONS})`}
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
              onPress={() => toggleTag('mechanics', v)}
            />
          ))}
          {mechanicsAll.length > TOP_OPTIONS && (
            <Chip
              label={showAllMechanics ? '접기' : `더보기 (${mechanicsAll.length - TOP_OPTIONS})`}
              onPress={() => setShowAllMechanics((v) => !v)}
            />
          )}
        </View>
      </CollapsibleFilterSection>

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>정렬</Text>
      <View style={styles.chipRow}>
        {SORTS.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            selected={filter.sort === s.key}
            onPress={() => patch({ sort: s.key })}
          />
        ))}
      </View>

      <View style={styles.countRow}>
        <Text style={[styles.count, { color: c.text }]}>
          {loading ? '불러오는 중…' : `${games.length}개`}
          {!loading && filter.playerCount !== null && (
            <Text style={{ color: c.textSecondary }}>
              {' '}· {filter.playerCount}명 기준 {SORTS.find((s) => s.key === filter.sort)?.label ?? ''}
            </Text>
          )}
        </Text>
        <View style={styles.countActions}>
          {hasExtraFilters && <Chip label="분류 초기화" onPress={resetFilters} />}
          {/* 조건은 맞는데 못 정할 때 — 현재 필터(인원 하드 필터 포함)를 통과한 게임 중 무작위 */}
          {filter.playerCount !== null && games.length > 0 && (
            <Chip
              label="🎲 룰렛"
              onPress={() => {
                const pick = games[Math.floor(Math.random() * games.length)];
                if (pick) setSelectedId(pick.id);
              }}
            />
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
      // numColumns가 바뀌면 key도 바꿔야 RN이 리스트를 재생성한다.
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
            onPress={() => setSelectedId(item.id)}
          />
        </View>
      )}
      ListEmptyComponent={
        loading ? (
          <LoadingView />
        ) : (
          <EmptyView
            title="조건에 맞는 게임이 없어요"
            hint={alternatives.length ? '조건을 하나 빼면 이런 것들이 있어요' : '조건을 바꿔보세요'}>
            <View style={styles.chipRow}>
              {alternatives.map((r) => (
                <Chip key={r.label} label={r.label} count={r.count} onPress={() => setFilter(r.filter)} />
              ))}
            </View>
          </EmptyView>
        )
      }
    />
  );

  const overlays = (
    <>
      {editing && (
        <GameForm
          key={editing.id}
          visible
          game={editing}
          categoryOptions={categoryOptions}
          onClose={() => setEditing(null)}
          onDeleted={() => setSelectedId(null)}
        />
      )}
      <Modal visible={changingMembers} animationType="slide" onRequestClose={() => setChangingMembers(false)}>
        <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: c.background }}>
          <SessionSetup
            initialIds={session.memberIds}
            confirmLabel="변경하기"
            onConfirm={(ids) => {
              // 게임중이면 그 판의 멤버까지 바꾸는 비동기 작업이라, 성공했을 때만 닫는다.
              void session.setMemberIds(ids).then((ok) => {
                if (ok) setChangingMembers(false);
              });
            }}
            onClose={() => setChangingMembers(false)}
          />
        </View>
      </Modal>
      <PlaySheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />

      {/* 모임 마무리 리캡 — 오늘의 엔딩 크레딧 */}
      <Modal visible={!!recap} transparent animationType="fade" onRequestClose={finalizeSession}>
        <Pressable style={styles.recapBackdrop} onPress={finalizeSession}>
          <Pressable
            style={[styles.recapCard, { backgroundColor: c.backgroundElement, borderColor: c.accent }]}
            onPress={() => undefined}>
            <Text style={[styles.caption, { color: c.textSecondary }]}>오늘의 모임</Text>
            <Text style={[styles.recapTitle, { color: c.accent }]}>{recap?.count}판</Text>
            {!!recap?.winners && (
              <Text style={[styles.recapLine, { color: c.text }]} numberOfLines={2}>
                {recap.winners}
              </Text>
            )}
            {(recap?.minutes ?? 0) > 0 && (
              <Text style={[styles.caption, { color: c.textSecondary }]}>
                총 플레이 {recap?.minutes}분
              </Text>
            )}
            <Text style={[styles.recapLine, { color: c.textSecondary }]}>수고하셨어요! 🎉</Text>
            <Chip label="모임 끝내기" selected onPress={finalizeSession} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  return (
    <View
      style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}
      onLayout={onLayout}>
      {list}
      {/* 상세는 어느 크기에서든 가운데 팝업 — 우측 패널은 태블릿에서 불편하다는 실사용 피드백 */}
      <CenterModal visible={!!selected} onClose={() => setSelectedId(null)}>
        {selected && (
          <GameDetail
            game={selected}
            playerCount={filter.playerCount}
            onClose={() => setSelectedId(null)}
            onEdit={() => setEditing(selected)}
          />
        )}
      </CenterModal>
      {overlays}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: Spacing.four, gap: Spacing.three },
  column: { gap: Spacing.three },
  controls: { gap: Spacing.two, paddingBottom: Spacing.four },
  sessionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  sessionText: { ...Typography.body, flex: 1 },
  sessionChange: { minHeight: TouchTarget.min, justifyContent: 'center', paddingHorizontal: Spacing.two },
  playingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget.primary,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  playingText: { ...Typography.body, fontWeight: '700', flex: 1 },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  todayBody: { flex: 1, gap: 2 },
  todayTitle: { ...Typography.subtitle },
  endSessionButton: {
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  search: {
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
    ...Typography.body,
  },
  recapBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: Spacing.five,
  },
  recapCard: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.six,
    borderRadius: Radius.lg,
    borderWidth: 2,
    minWidth: 300,
    maxWidth: 480,
  },
  recapTitle: { fontSize: 52, lineHeight: 68, fontFamily: 'Jua_400Regular' },
  recapLine: { ...Typography.subtitle, textAlign: 'center' },
  h1: { ...Typography.display, marginTop: Spacing.two },
  sub: { ...Typography.body, marginBottom: Spacing.two },
  groupLabel: { ...Typography.label, marginTop: Spacing.three },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingRight: Spacing.three },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  count: { ...Typography.subtitle, flexShrink: 1 },
  countActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  caption: { ...Typography.caption },
});
