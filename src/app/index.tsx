import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ChipRow } from '@/components/chip-row';
import { GameCard } from '@/components/game-card';
import { CenterModal } from '@/components/center-modal';
import { CollapsibleFilterSection } from '@/components/filter-section';
import { GameDetail } from '@/components/game-detail';
import { GameForm } from '@/components/game-form';
import { PlaySheet } from '@/components/play-sheet';
import { Fab } from '@/components/fab';
import { ScreenTitle } from '@/components/screen-title';
import { SessionSetup } from '@/components/session-setup';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { setPostDraft } from '@/features/community/draft';
import { useMeetups, useMyProfile } from '@/features/community/hooks';
import { useGameLikes } from '@/features/games/likes';
import { useGames } from '@/features/games/hooks';
import {
  countBy,
  optionCounts,
  passesFilter,
  playtimeBandOf,
  relaxations,
} from '@/features/games/recommend';
import {
  EMPTY_FILTER,
  type Game,
  type GameFilter,
  type PlaytimeBand,
  type SortKey,
} from '@/features/games/types';
import { usePlayHistory, useSession } from '@/features/plays/hooks';
import { computeStandings } from '@/features/plays/stats';
import { useElapsedMinutes } from '@/hooks/use-elapsed-minutes';
import { useGridColumns } from '@/hooks/use-grid-columns';
import { gridKey, useGridRows } from '@/hooks/use-grid-rows';
import { useConfirmOnce } from '@/hooks/use-confirm-once';
import { useTheme } from '@/hooks/use-theme';
import { localDateOf, localToday } from '@/lib/dates';

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** 겹치지 않는 구간이다 — 라벨의 시간은 그 구간의 상한을 뜻한다. */
const TIME_OPTIONS: { label: string; value: PlaytimeBand }[] = [
  { label: '30분', value: 'short' },
  { label: '1시간', value: 'medium' },
  { label: '2시간', value: 'long' },
  { label: '2시간+', value: 'epic' },
];
const WEIGHT_OPTIONS: { label: string; value: [number, number] }[] = [
  { label: '가볍게', value: [1, 2] },
  { label: '적당히', value: [2, 3] },
  { label: '묵직하게', value: [3, 5] },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: '추천순' },
  { key: 'mostLiked', label: '하트순' },
  { key: 'mostPlayed', label: '많이 한 순' },
  { key: 'longestUnplayed', label: '오랜만인 순' },
];

export default function RecommendScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  // 게임 목록은 모임의 공용 자산이라 모임장만 고친다.
  const me = useMyProfile();
  const canEditGames = me.profile?.isAdmin ?? false;
  const likes = useGameLikes();

  const [filter, setFilter] = useState<GameFilter>(EMPTY_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Game | null>(null);
  const [changingMembers, setChangingMembers] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 모임 마무리 확인 — 다른 곳을 건드리면 풀린다.
  const endConfirm = useConfirmOnce<'end'>();
  /** 모임 마무리 리캡 — 세션을 닫기 직전에 데이터를 붙잡아 팝업으로 보여준다 */
  const [recap, setRecap] = useState<{ count: number; winners: string; minutes: number; titles: string[] } | null>(
    null
  );
  // 옵션이 많은 축은 기본 접힘 — 펼쳐두면 필터 영역이 목록을 밀어낸다.
  const [themeSectionOpen, setThemeSectionOpen] = useState(false);
  const [mechanicsSectionOpen, setMechanicsSectionOpen] = useState(false);

  const { columns, onLayout } = useGridColumns(240);

  /**
   * 오늘 온 사람들 중 계정이 있는 사람. 이 사람들이 하트를 누른 게임이 추천 위로 올라온다.
   * 손님은 하트를 누를 계정이 없으니 자연히 빠진다.
   */
  const audience = useMemo(
    () => session.sessionMembers.map((m) => m.profileId).filter((id): id is string => Boolean(id)),
    [session.sessionMembers]
  );
  const { all, games, loading, error, reload } = useGames(filter, audience);
  // 마지막 줄을 빈 칸으로 메워, 남은 카드가 줄 전체로 늘어나지 않게 한다.
  const cells = useGridRows(games, columns);
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
    // 같은 게임을 여러 판 했으면 제목은 한 번만. 순서는 한 순서를 지킨다.
    const titles = [...new Set(todayPlays.map((p) => p.gameTitle))].reverse();
    return { count: todayPlays.length, winners, titles };
  }, [allPlays, session.members]);

  /**
   * 회고 글이 붙을 일정.
   *
   * 일정에서 시작한 모임이면 그것이 답이다. 아니면 오늘 잡혀 있던 일정을 찾아 본다 —
   * 버튼을 안 눌렀어도 그 일정의 날에 논 것은 맞으니까.
   */
  const { meetups } = useMeetups(me.isMember);
  const todayMeetup = useMemo(
    () =>
      session.meetup ??
      meetups.find((m) => localDateOf(m.startsAt) === localToday()) ??
      null,
    [meetups, session.meetup]
  );

  const categories = useMemo(() => countBy(all, 'categories').map(([v]) => v), [all]);
  const themesAll = useMemo(() => countBy(all, 'themes').map(([v]) => v), [all]);
  const mechanicsAll = useMemo(() => countBy(all, 'mechanics').map(([v]) => v), [all]);

  const categoryCounts = useMemo(
    () => optionCounts(all, filter, 'categories', categories),
    [all, filter, categories]
  );
  const themeCounts = useMemo(
    () => optionCounts(all, filter, 'themes', themesAll),
    [all, filter, themesAll]
  );
  const mechanicCounts = useMemo(
    () => optionCounts(all, filter, 'mechanics', mechanicsAll),
    [all, filter, mechanicsAll]
  );

  // 구간이 겹치지 않아 빈 구간이 생길 수 있다. 누르기 전에 몇 개인지 보여준다(0이면 흐려짐).
  const timeCounts = useMemo(() => {
    const base = { ...filter, playtimeBand: null };
    const counts = {} as Record<PlaytimeBand, number>;
    for (const o of TIME_OPTIONS) {
      counts[o.value] = all.filter(
        (g) => playtimeBandOf(g) === o.value && passesFilter(g, base)
      ).length;
    }
    return counts;
  }, [all, filter]);

  const toggleTag = (key: 'categories' | 'themes' | 'mechanics', value: string) =>
    setFilter((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  // 인원만 남기고 나머지 분류를 전부 비운다.
  const hasExtraFilters =
    filter.playtimeBand !== null ||
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

  /**
   * 리캡을 그대로 피드 초안으로 옮긴다.
   *
   * 모임 후기가 안 남는 건 쓸 말이 없어서가 아니라 빈 칸 앞에서 멈추기 때문이다.
   * 오늘 뭘 했고 누가 이겼는지는 앱이 이미 알고 있으니, 첫 문장을 앱이 쓴다.
   * 사진 붙이고 한 줄 고치는 일만 사람에게 남긴다.
   */
  const writeRecap = () => {
    if (!recap) return;
    const lines = [`오늘 ${recap.count}판 — ${recap.titles.join(', ')}`];
    if (recap.winners) lines.push(recap.winners);
    if (recap.minutes > 0) lines.push(`총 플레이 ${recap.minutes}분`);
    setPostDraft({
      // 끝에 빈 줄을 둬서 커서가 아래에 놓이게 한다 — 사진 설명을 이어 쓰기 좋다.
      body: `${lines.join('\n')}\n\n`,
      meetupId: todayMeetup?.id ?? null,
      meetupTitle: todayMeetup?.title ?? null,
    });
    finalizeSession();
    router.push('/feed');
  };

  // 모임 마무리 — 2탭 확인 후, 오늘 판이 있으면 리캡을 먼저 보여준다.
  const endSession = () =>
    endConfirm.press('end', () => {
      finishSession();
    });

  const finishSession = () => {
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
      titles: todaySummary.titles,
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
                { borderColor: endConfirm.pendingId ? c.danger : c.border },
              ]}>
              <Text
                style={[
                  styles.caption,
                  { color: endConfirm.pendingId ? c.danger : c.text, fontWeight: '600' },
                ]}>
                {endConfirm.pendingId ? '정말 마무리할까요?' : '모임 마무리 🎉'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <ScreenTitle
        title="오늘 뭐 할까?"
        subtitle={
          session.meetup
            ? `${session.meetup.title} 진행 중`
            : '조건을 고르면 지금 하기 좋은 순서로 보여드려요.'
        }
      />

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
      <ChipRow
        items={PLAYER_OPTIONS.map((n) => ({
          key: String(n),
          label: n === 10 ? '10명+' : `${n}명`,
          selected: filter.playerCount === n,
          onPress: () => patch({ playerCount: filter.playerCount === n ? null : n }),
        }))}
      />

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>시간</Text>
      <ChipRow
        items={TIME_OPTIONS.map((o) => ({
          key: o.value,
          label: o.label,
          count: timeCounts[o.value],
          selected: filter.playtimeBand === o.value,
          onPress: () => patch({ playtimeBand: filter.playtimeBand === o.value ? null : o.value }),
        }))}
      />

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>난이도</Text>
      <ChipRow
        items={WEIGHT_OPTIONS.map((o) => {
          const on = filter.weightRange?.[0] === o.value[0] && filter.weightRange?.[1] === o.value[1];
          return {
            key: o.label,
            label: o.label,
            selected: on,
            onPress: () => patch({ weightRange: on ? null : o.value }),
          };
        })}
      />

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>카테고리</Text>
      <ChipRow
        items={categories.map((v) => ({
          key: v,
          label: v,
          count: categoryCounts[v],
          selected: filter.categories.includes(v),
          onPress: () => toggleTag('categories', v),
        }))}
      />

      <CollapsibleFilterSection
        label="테마"
        selectedCount={filter.themes.length}
        expanded={themeSectionOpen}
        onToggle={() => setThemeSectionOpen((v) => !v)}>
        <ChipRow
          items={themesAll.map((v) => ({
            key: v,
            label: v,
            count: themeCounts[v],
            selected: filter.themes.includes(v),
            onPress: () => toggleTag('themes', v),
          }))}
        />
      </CollapsibleFilterSection>

      <CollapsibleFilterSection
        label="메커니즘"
        selectedCount={filter.mechanics.length}
        expanded={mechanicsSectionOpen}
        onToggle={() => setMechanicsSectionOpen((v) => !v)}>
        <ChipRow
          items={mechanicsAll.map((v) => ({
            key: v,
            label: v,
            count: mechanicCounts[v],
            selected: filter.mechanics.includes(v),
            onPress: () => toggleTag('mechanics', v),
          }))}
        />
      </CollapsibleFilterSection>

      <Text style={[styles.groupLabel, { color: c.textSecondary }]}>정렬</Text>
      <ChipRow
        items={SORTS.map((o) => ({
          key: o.key,
          label: o.label,
          selected: filter.sort === o.key,
          onPress: () => patch({ sort: o.key }),
        }))}
      />

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
      data={cells}
      keyExtractor={gridKey}
      ListHeaderComponent={header}
      columnWrapperStyle={columns > 1 ? styles.column : undefined}
      contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.six }]}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          {item && (
            <GameCard
              game={item}
              playerCount={filter.playerCount}
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
          themeOptions={themesAll}
          mechanicOptions={mechanicsAll}
          onClose={() => setEditing(null)}
          onDeleted={() => setSelectedId(null)}
        />
      )}
      {/* 오늘의 멤버 — 인원수만 보여 주고 누르면 고르는 창이 뜬다.
          목록 위쪽에 바로 두면 스크롤을 내리는 순간 사라져, 중간에 사람이 늘거나 빠졌을 때
          맨 위까지 되돌아가야 했다. */}
      {!session.error && (
        <Fab
          icon="user"
          label={session.memberIds.length ? `${session.memberIds.length}명` : '멤버 선택'}
          accessibilityLabel="오늘의 멤버 고르기"
          tone={session.memberIds.length ? 'neutral' : 'accent'}
          onPress={() => setChangingMembers(true)}
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
            onEndSession={
              session.memberIds.length > 0 && !session.activePlay
                ? {
                    label: endConfirm.pendingId ? '정말 마무리할까요?' : '모임 마무리',
                    danger: endConfirm.pendingId !== null,
                    onPress: () => {
                      endSession();
                      // 리캡이 뜨거나 세션이 닫히므로 창은 닫는다.
                      if (endConfirm.pendingId) setChangingMembers(false);
                    },
                  }
                : undefined
            }
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
            <View style={styles.recapActions}>
              {me.isMember && (
                <Chip label="피드에 남기기" selected onPress={writeRecap} />
              )}
              <Chip label="모임 끝내기" selected={!me.isMember} onPress={finalizeSession} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  return (
    <View
      {...endConfirm.bind}
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
            onEdit={canEditGames ? () => setEditing(selected) : undefined}
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
  // 칸을 flex로 두면 줄이 언제나 정확히 채워진다 — 폭을 몇 픽셀 잘못 재도 여백이 남지 않는다.
  cell: { flex: 1 },
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
  recapActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
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
