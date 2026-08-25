import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow } from '@/components/chip-row';
import { PlayEditor } from '@/components/play-editor';
import { roundLabel } from '@/components/play-sheet';
import { SearchBar } from '@/components/search-bar';
import { storageImageUrl } from '@/features/games/images';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { usePlayHistory, useSession } from '@/features/plays/hooks';
import type { PlayWithGame } from '@/features/plays/queries';
import { useConfirmOnce } from '@/hooks/use-confirm-once';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { localDateOf, localToday } from '@/lib/dates';

/** 플레이 기록 — 날짜별로 묶어 최근부터. */
export default function HistoryScreen() {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const { members } = useSession();
  const { plays, loading, error, reload, remove, applyUpdate, pending } = usePlayHistory();
  // 삭제 확인은 다른 곳을 건드리면 원래대로 돌아간다 — 확인 상태가 남아 있으면
  // 나중에 무심코 누른 한 번에 지워진다.
  const confirm = useConfirmOnce<string>();
  const [editing, setEditing] = useState<PlayWithGame | null>(null);
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);

  /**
   * 기록 찾기 — 게임 이름과 메모, 그리고 함께한 사람으로 좁힌다.
   *
   * "지난번 그 게임 언제 했더라"와 "누구랑 했을 때가 재밌었지"가 사람들이 기록을
   * 뒤지는 두 가지 이유다. 날짜로 스크롤해 찾는 건 판이 쌓일수록 불가능해진다.
   */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return plays.filter((p) => {
      if (memberId && !p.memberIds.includes(memberId)) return false;
      if (!needle) return true;
      const names = p.memberIds
        .map((id) => members.find((m) => m.id === id)?.name ?? '')
        .join(' ');
      return [p.gameTitle, p.memo ?? '', names].some((v) =>
        v.toLowerCase().includes(needle)
      );
    });
  }, [plays, query, memberId, members]);

  const filtering = query.trim().length > 0 || memberId !== null;

  // 기록에 한 번이라도 나온 사람만. 이름순이 아니라 많이 한 순 — 자주 찾는 사람이 앞에 온다.
  const playedMembers = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of plays) {
      for (const id of p.memberIds) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => members.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }, [plays, members]);

  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <ErrorView message={error} onRetry={() => void reload()} />
      </View>
    );
  }

  const dateLabel = (iso: string) => {
    const d = localDateOf(iso);
    return d === localToday() ? `${d} · 오늘` : d;
  };

  const memberNames = (p: PlayWithGame) =>
    p.memberIds
      .map((id) => members.find((m) => m.id === id)?.name)
      .filter(Boolean)
      .join(' · ');

  return (
    <View
      {...confirm.bind}
      style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.six }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.h1, t.display, { color: c.text }]}>기록</Text>
            <Text style={[styles.sub, { color: c.textSecondary }]}>
              {filtering
                ? `${shown.length}판 / 전체 ${plays.length}판`
                : plays.length
                  ? `지금까지 ${plays.length}판`
                  : ' '}
            </Text>
            {plays.length > 0 && (
              <View style={styles.filters}>
                <SearchBar
                  value={query}
                  onChange={setQuery}
                  placeholder="게임 이름·메모·사람으로 찾기"
                />
                {/* 손님까지 포함해 기록에 실제로 등장한 사람만 칩으로 낸다 —
                    한 번도 같이 안 한 사람 칩은 누를 이유가 없다. */}
                <ChipRow
                  items={playedMembers.map((m) => ({
                    key: m.id,
                    label: m.name,
                    selected: memberId === m.id,
                    onPress: () => setMemberId((cur) => (cur === m.id ? null : m.id)),
                  }))}
                />
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          // 날짜가 바뀌는 지점에만 날짜 헤더를 끼운다.
          const prev = shown[index - 1];
          const showDate =
            !prev || localDateOf(prev.endedAt ?? '') !== localDateOf(item.endedAt ?? '');
          // 판 소요시간 — 빠른 기록(시작=종료)은 0분이라 자동으로 숨겨진다.
          const durationMin = item.endedAt
            ? Math.round(
                (new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000
              )
            : 0;
          return (
            <View style={styles.itemWrap}>
              {showDate && item.endedAt && (
                <Text style={[styles.dateHeader, { color: c.textSecondary }]}>
                  {dateLabel(item.endedAt)}
                </Text>
              )}
              <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                <View style={styles.cardTop}>
                  {/* 게임 표지 썸네일 — 제목보다 그림이 먼저 눈에 들어온다 */}
                  <View style={[styles.thumb, { backgroundColor: c.backgroundSelected }]}>
                    {item.gameImagePath ? (
                      <Image
                        source={{ uri: storageImageUrl(item.gameImagePath) ?? undefined }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={100}
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <Text style={[styles.thumbFallback, { color: c.textSecondary }]}>
                        {item.gameTitle.slice(0, 2)}
                      </Text>
                    )}
                  </View>

                  <View style={styles.cardHead}>
                    <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
                      {item.gameTitle}
                    </Text>
                    <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={1}>
                      {memberNames(item)}
                      {durationMin >= 1 && durationMin <= 720 ? ` · ${durationMin}분` : ''}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => setEditing(item)}
                    accessibilityRole="button"
                    accessibilityLabel="기록 편집"
                    style={styles.delete}>
                    <Text style={[styles.caption, { color: c.accent }]}>편집</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirm.press(item.id, () => void remove(item.id))}
                    disabled={pending}
                    accessibilityRole="button"
                    accessibilityLabel="기록 삭제"
                    style={styles.delete}>
                    <Text
                      style={[
                        styles.caption,
                        { color: confirm.pendingId === item.id ? c.danger : c.textSecondary },
                      ]}>
                      {confirm.pendingId === item.id ? '정말 삭제?' : '✕'}
                    </Text>
                  </Pressable>
                </View>

                {/* 라운드는 한 줄에 하나씩 — 이어붙이면 판이 길수록 읽을 수 없다 */}
                {item.rounds.length > 0 ? (
                  <View style={[styles.roundsBlock, { borderTopColor: c.border }]}>
                    {item.rounds.map((r, i) => (
                      <View key={`${item.id}-${i}`} style={styles.roundLine}>
                        <Text style={[styles.roundNum, { color: c.textSecondary }]}>{i + 1}R</Text>
                        <Text style={[styles.body, { color: c.text, flex: 1 }]} numberOfLines={2}>
                          {roundLabel(r, members)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.caption, { color: c.textSecondary }]}>라운드 기록 없음</Text>
                )}

                {Object.keys(item.scores).length > 0 && (
                  <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={1}>
                    점수:{' '}
                    {Object.entries(item.scores)
                      .sort((a, b) => b[1] - a[1])
                      .map(
                        ([id, v]) => `${members.find((m) => m.id === id)?.name ?? '?'} ${v}`
                      )
                      .join(' · ')}
                  </Text>
                )}

                {item.memo && (
                  <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={2}>
                    “{item.memo}”
                  </Text>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <LoadingView />
          ) : filtering ? (
            <EmptyView title="찾는 기록이 없어요" hint="검색어를 줄이거나 사람 조건을 빼보세요." />
          ) : (
            <EmptyView
              title="아직 기록이 없어요"
              hint="게임을 시작하고 종료하면 여기에 날짜별로 쌓입니다."
            />
          )
        }
      />

      {editing && (
        <PlayEditor
          key={editing.id}
          play={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={applyUpdate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: Spacing.four, maxWidth: 720, width: '100%', alignSelf: 'center' },
  header: { gap: Spacing.one, paddingBottom: Spacing.three },
  filters: { gap: Spacing.two, paddingTop: Spacing.two },
  h1: { ...Typography.display },
  sub: { ...Typography.body },
  dateHeader: { ...Typography.label, marginTop: Spacing.three, marginBottom: Spacing.two },
  itemWrap: { gap: 0 },
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardHead: { flex: 1, gap: 2 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFallback: { ...Typography.subtitle },
  roundsBlock: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  roundLine: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  roundNum: { ...Typography.caption, width: 28, lineHeight: 24 },
  title: { ...Typography.subtitle },
  body: { ...Typography.body },
  caption: { ...Typography.caption },
  delete: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
