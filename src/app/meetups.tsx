import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, usePathname } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DateTimeField, toDateValue, toTimeValue } from '@/components/date-time-picker';
import { Fab } from '@/components/fab';
import { Icon } from '@/components/icon';
import { MeetupCalendar } from '@/components/meetup-calendar';
import { MemberGate } from '@/components/member-gate';
import { ScreenTitle } from '@/components/screen-title';
import { SheetModal } from '@/components/sheet-modal';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Shadow, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { refreshActivity, useMarkSeen } from '@/features/community/activity';
import { useFeed, useMeetups, useMyProfile } from '@/features/community/hooks';
import { playsOfMeetup, postsOfMeetup } from '@/features/community/meetup-plays';
import { openMeetup, useOpenProfile } from '@/features/community/navigation';
import type { MeetupInput } from '@/features/community/queries';
import { RSVP_LABEL, type Meetup, type RsvpStatus } from '@/features/community/types';
import { usePlayHistory, useSession } from '@/features/plays/hooks';
import { useMenuToggle } from '@/hooks/use-confirm-once';
import { useTheme } from '@/hooks/use-theme';
import { useTouch } from '@/hooks/use-touch';
import { appOrigin, copyText } from '@/lib/clipboard';
import {
  dDay,
  formatClock,
  formatDayLabel,
  formatMeetupTime,
  localDateOf,
  localToday,
  monthOf,
} from '@/lib/dates';

const STATUSES: RsvpStatus[] = ['going', 'maybe', 'no'];

/** 목록으로 볼지 달력으로 볼지. 고른 쪽을 기억한다. */
type Mode = 'list' | 'calendar';
const MODE_KEY = 'meepick.meetupView';

/** 지난 모임 카드에 붙이는 요약 — 그날 몇 판 했고 글·사진이 몇 개 달렸나. */
type Recap = { plays: number; posts: number; photos: number };

export default function MeetupsScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { profile, loading: profileLoading, isMember } = useMyProfile();
  const list = useMeetups(isMember);
  const feed = useFeed(isMember);
  const { plays } = usePlayHistory();
  const session = useSession();
  const [composing, setComposing] = useState(false);
  /** 달력의 빈 날에서 '이 날 일정 만들기'로 열면 그 날짜가 들어간다. */
  const [composeDate, setComposeDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * 목록 / 달력.
   *
   * 목록은 "다음 모임이 뭐지"에, 달력은 "이번 달에 몇 번 모이지, 그 주말은 비었나"에 답한다.
   * 달력으로 보는 사람은 매번 달력으로 보고 싶어 하므로 고른 쪽을 기기에 기억한다.
   */
  const [mode, setMode] = useState<Mode>('list');
  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((saved) => {
        if (saved === 'list' || saved === 'calendar') setMode(saved);
      })
      .catch(() => undefined);
  }, []);
  const changeMode = (next: Mode) => {
    setMode(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => undefined);
  };

  const [month, setMonth] = useState(() => monthOf(localToday()));
  const [selected, setSelected] = useState(() => localToday());
  // 앞뒤 달의 흐린 날짜를 눌러도 그 달로 넘어간다 — 고른 날이 화면 밖에 있으면 안 된다.
  const selectDay = (date: string) => {
    setSelected(date);
    if (monthOf(date) !== month) setMonth(monthOf(date));
  };

  const recaps = useMemo(() => {
    const map = new Map<string, Recap>();
    for (const m of list.meetups) {
      if (!m.isPast) continue;
      const posts = postsOfMeetup(m, feed.posts);
      map.set(m.id, {
        plays: playsOfMeetup(m, list.meetups, plays).length,
        posts: posts.length,
        photos: posts.reduce((n, p) => n + p.imagePaths.length, 0),
      });
    }
    return map;
  }, [list.meetups, plays, feed.posts]);

  // 화면을 보고 있는 동안은 '봤다'로 유지한다 — 이유는 feed.tsx와 같다.
  useMarkSeen('meetups', usePathname() === '/meetups');
  useEffect(() => {
    void refreshActivity();
  }, []);

  /**
   * 참석자 중 **플레이 멤버 행이 연결된 사람**만 자동으로 들어올 수 있다.
   * 계정만 있고 아직 손님 기록과 이어지지 않은 사람은 여기서 빠지므로,
   * 버튼에 참석 인원이 아니라 이 수를 적는다 — 3명이라 해 놓고 1명이 들어오면
   * 무엇이 잘못됐는지 알 길이 없다.
   */
  const startableIds = (meetup: Meetup) =>
    meetup.rsvps
      .filter((r) => r.status === 'going')
      .map((r) => session.members.find((m) => m.profileId === r.profile.id)?.id)
      .filter((id): id is string => Boolean(id));

  /**
   * 일정에서 모임을 시작한다 — 참석자를 그대로 오늘의 멤버로 앉히고 추천 화면으로 보낸다.
   * 여기까지 오면 "누구랑 하지"를 다시 고를 이유가 없다.
   */
  const startMeetup = (meetup: Meetup) => {
    // 아무도 못 들어와도 시작은 시킨다 — 일정 연결은 유지되고, 멤버는 다음 화면에서 고른다.
    if (session.startFromMeetup({ id: meetup.id, title: meetup.title }, startableIds(meetup)))
      router.push('/');
  };

  if (profileLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <LoadingView />
      </View>
    );
  }

  if (!isMember || !profile) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <MemberGate />
      </View>
    );
  }

  if (list.error && !list.meetups.length) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <ErrorView message={list.error} onRetry={() => void list.reload()} />
      </View>
    );
  }

  const upcoming = list.meetups.filter((m) => !m.isPast).length;
  const dayMeetups = list.meetups
    .filter((m) => localDateOf(m.startsAt) === selected)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const header = (
    <View style={styles.header}>
      <ScreenTitle
        title="모임 일정"
        subtitle={upcoming > 0 ? `예정된 모임 ${upcoming}개` : '예정된 모임이 없어요'}
      />
      <ModeToggle mode={mode} onChange={changeMode} />
      {list.error && <Text style={[styles.caption, { color: c.danger }]}>{list.error}</Text>}
    </View>
  );

  const openComposer = (date: string | null) => {
    setComposeDate(date);
    setComposing(true);
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
      {mode === 'calendar' ? (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.six }]}>
          {header}
          <MeetupCalendar
            meetups={list.meetups}
            month={month}
            selected={selected}
            onMonthChange={setMonth}
            onSelect={selectDay}
          />

          {/* 고른 날의 일정 — 칸 안에 다 넣으면 폰에서 읽히지 않아 아래에 따로 보여 준다. */}
          <View style={styles.dayPanel}>
            <Text style={[styles.dayLabel, { color: c.text }]}>{formatDayLabel(selected)}</Text>
            {list.loading ? (
              <LoadingView />
            ) : dayMeetups.length === 0 ? (
              <View style={styles.dayEmpty}>
                <Text style={[styles.caption, { color: c.textSecondary }]}>
                  이날은 일정이 없어요.
                </Text>
                {/* 지난 날짜에 일정을 새로 잡을 일은 없다. */}
                {selected >= localToday() && (
                  <Pressable
                    onPress={() => openComposer(selected)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.dayCreate,
                      { borderColor: c.accent },
                      pressed && styles.pressed,
                    ]}>
                    <Icon name="plus" size={16} color={c.accent} />
                    <Text style={[styles.caption, styles.bold, { color: c.accent }]}>
                      이 날 일정 만들기
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              dayMeetups.map((m) => (
                <DayRow
                  key={m.id}
                  meetup={m}
                  recap={recaps.get(m.id)}
                  onPress={() => openMeetup(m.id)}
                />
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={list.meetups}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.six }]}
          ListHeaderComponent={header}
          renderItem={({ item }) =>
            editingId === item.id ? (
              <MeetupComposer
                initial={item}
                pending={list.pending}
                submitLabel="수정 저장"
                onCancel={() => setEditingId(null)}
                onSubmit={async (input) => {
                  const ok = await list.edit(item.id, input);
                  if (ok) setEditingId(null);
                  return ok;
                }}
              />
            ) : (
              <MeetupCard
                meetup={item}
                myId={profile.id}
                isAdmin={profile.isAdmin}
                activeMeetupId={session.meetup?.id ?? null}
                blocked={session.activePlay !== null}
                startCount={startableIds(item).length}
                recap={recaps.get(item.id)}
                onOpen={() => openMeetup(item.id)}
                onStart={() => startMeetup(item)}
                onRsvp={(s) => void list.rsvp(item.id, s)}
                onEdit={() => {
                  setEditingId(item.id);
                  setComposing(false);
                }}
                onDelete={() => void list.remove(item.id)}
              />
            )
          }
          ListEmptyComponent={
            list.loading ? (
              <LoadingView />
            ) : (
              <EmptyView
                title="예정된 모임이 없어요"
                hint="오른쪽 아래 ＋ 로 다음 모임을 잡아보세요."
              />
            )
          }
        />
      )}

      <Fab
        icon="plus"
        label="일정"
        accessibilityLabel="일정 추가"
        onPress={() => openComposer(null)}
      />

      {/* 만들기는 창으로 띄운다 — 목록 맨 위에 펼치면 스크롤을 내린 상태에서는 보이지 않고,
          펼친 만큼 아래 일정들이 밀려 내려간다. */}
      <SheetModal visible={composing} onClose={() => setComposing(false)}>
        <MeetupComposer
          // 날짜를 바꿔 다시 열면 새로 시작한다 — 입력칸은 처음 값만 받는다.
          key={composeDate ?? 'new'}
          bare
          initialDate={composeDate ?? undefined}
          pending={list.pending}
          onSubmit={async (input) => {
            const ok = await list.create(input);
            if (ok) setComposing(false);
            return ok;
          }}
        />
      </SheetModal>
    </View>
  );
}

function MeetupCard({
  meetup,
  myId,
  isAdmin,
  activeMeetupId,
  blocked,
  startCount,
  recap,
  onOpen,
  onStart,
  onRsvp,
  onEdit,
  onDelete,
}: {
  meetup: Meetup;
  myId: string;
  isAdmin: boolean;
  /** 지금 진행 중인 모임의 일정 id. 이 카드가 그것이면 '진행 중'으로 보인다 */
  activeMeetupId: string | null;
  /** 게임중이면 다른 모임을 시작할 수 없다 — 진행 중인 판이 유령이 된다 */
  blocked: boolean;
  /** 참석자 중 실제로 오늘의 멤버가 될 수 있는 사람 수 */
  startCount: number;
  /** 지난 모임의 요약. 다가오는 모임이면 없다 */
  recap: Recap | undefined;
  /** 모임 페이지로 */
  onOpen: () => void;
  onStart: () => void;
  onRsvp: (s: RsvpStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const c = useTheme();
  const openProfile = useOpenProfile();
  // 메뉴는 카드 안 다른 곳을 건드리면 닫힌다 — 열린 채 남으면 일정 내용을 가린다.
  const menu = useMenuToggle<'meetup'>();
  const past = meetup.isPast;
  // 일정은 모임 전체가 쓰는 공용 정보라, 만든 사람이 자리를 비워도 모임장이 고칠 수 있어야 한다.
  const mine = meetup.createdBy === myId || isAdmin;

  const by = (s: RsvpStatus) => meetup.rsvps.filter((r) => r.status === s);
  const going = by('going');
  const maybe = by('maybe');
  const no = by('no');

  const soon = !past && (dDay(meetup.startsAt) === '오늘' || dDay(meetup.startsAt) === '내일');
  const full = meetup.capacity !== null && going.length >= meetup.capacity;
  const running = activeMeetupId === meetup.id;
  const [shared, setShared] = useState(false);

  /**
   * 단톡방에 붙여넣을 텍스트를 만든다.
   *
   * 푸시 알림이 없는 지금, 모임을 알리는 실제 수단은 카톡이다. 앱이 아는 것(언제·어디서·
   * 몇 명)을 사람이 다시 타이핑하게 두지 않는다. 링크는 지금 열려 있는 주소로 만든다 —
   * 받는 사람도 같은 문으로 들어와야 열린다.
   */
  const share = async () => {
    const lines = [
      `🎲 ${meetup.title}`,
      formatMeetupTime(meetup.startsAt) + (meetup.place ? ` · ${meetup.place}` : ''),
      `지금 ${going.length}명 참석${meetup.capacity !== null ? ` (정원 ${meetup.capacity})` : ''}`,
      `→ ${appOrigin()}/meetups`,
    ];
    if (await copyText(lines.join('\n'))) {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };
  // 오늘 열리는 모임에만 시작 버튼을 낸다. 다음 주 일정에 붙어 있으면 잘못 누르기만 좋다.
  const today = localDateOf(meetup.startsAt) === localToday();

  return (
    <View
      {...menu.bind}
      style={[
        styles.card,
        !past && Shadow.card,
        {
          backgroundColor: c.backgroundElement,
          borderColor: past ? c.border : soon ? c.accent : c.border,
          borderWidth: soon ? 2 : StyleSheet.hairlineWidth,
        },
        past && styles.pastCard,
      ]}>
      <View style={styles.cardHead}>
        {/* 제목 쪽을 누르면 모임 페이지 — 참석자 전체, 그날 한 게임, 사진이 거기 모여 있다. */}
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${meetup.title} 모임 보기`}
          style={({ pressed }) => [styles.cardHeadText, pressed && styles.pressed]}>
          <View style={styles.whenRow}>
            <View
              style={[
                styles.dday,
                {
                  backgroundColor: past
                    ? c.backgroundSelected
                    : soon
                      ? c.accent
                      : c.badgeRecommended,
                },
              ]}>
              <Text style={[styles.ddayText, { color: past ? c.textSecondary : c.onAccent }]}>
                {dDay(meetup.startsAt)}
              </Text>
            </View>
            <Text style={[styles.when, { color: c.textSecondary }]} numberOfLines={1}>
              {formatMeetupTime(meetup.startsAt)}
            </Text>
          </View>
          <View style={styles.titleRow}>
            <Text style={[styles.title, styles.titleText, { color: c.text }]}>{meetup.title}</Text>
            <Icon name="chevronRight" size={16} color={c.textSecondary} />
          </View>
          {!!meetup.place && (
            <Text style={[styles.body, { color: c.textSecondary }]}>{meetup.place}</Text>
          )}
        </Pressable>
        {/* 카드 흐름에 넣으면 일정 내용이 아래로 밀려, 누른 지점과 메뉴가 멀어진다. */}
        {mine && (
          <View style={styles.menuAnchor}>
            <Pressable
              onPress={() => menu.toggle('meetup')}
              accessibilityRole="button"
              accessibilityLabel="일정 메뉴"
              style={styles.iconButton}>
              <Icon name="more" size={20} color={c.textSecondary} />
            </Pressable>
            {menu.openId === 'meetup' && (
              <View
                {...menu.contentBind}
                style={[
                  styles.menu,
                  Shadow.card,
                  { backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}>
                <Pressable
                  onPress={() => {
                    menu.close();
                    onEdit();
                  }}
                  accessibilityRole="button"
                  style={styles.menuItem}>
                  <Text style={[styles.body, { color: c.text }]}>수정</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    menu.close();
                    onDelete();
                  }}
                  accessibilityRole="button"
                  style={styles.menuItem}>
                  <Text style={[styles.body, { color: c.danger }]}>삭제</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>

      {!!meetup.memo && <Text style={[styles.body, { color: c.text }]}>{meetup.memo}</Text>}

      <View style={styles.countRow}>
        <Text style={[styles.countText, { color: full ? c.accent : c.text }]}>
          참석 {going.length}
          {meetup.capacity !== null ? `/${meetup.capacity}` : ''}명{full ? ' · 정원 참' : ''}
        </Text>
        {maybe.length > 0 && (
          <Text style={[styles.caption, { color: c.textSecondary }]}>미정 {maybe.length}</Text>
        )}
        {no.length > 0 && (
          <Text style={[styles.caption, { color: c.textSecondary }]}>불참 {no.length}</Text>
        )}
        <View style={styles.spacer} />
        <Pressable
          onPress={() => void share()}
          accessibilityRole="button"
          accessibilityLabel="일정 공유 텍스트 복사"
          style={styles.shareButton}>
          <Text style={[styles.caption, { color: shared ? c.accent : c.textSecondary }]}>
            {shared ? '복사됨' : '공유'}
          </Text>
        </Pressable>
      </View>

      {going.length > 0 && (
        <View style={styles.attendees}>
          {going.slice(0, 10).map((r) => (
            <Pressable
              key={r.profile.id}
              onPress={() => openProfile(r.profile.id)}
              accessibilityRole="button"
              accessibilityLabel={`${r.profile.displayName} 프로필`}
              style={styles.attendee}>
              <Avatar profile={r.profile} size={28} />
              <Text style={[styles.attendeeName, { color: c.textSecondary }]} numberOfLines={1}>
                {r.profile.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* 지난 모임은 "그날 뭐 했더라"로 이어 준다. */}
      {past && (
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.recapLink,
            { borderTopColor: c.border },
            pressed && styles.pressed,
          ]}>
          <Icon name="dice" size={16} color={c.textSecondary} />
          <Text style={[styles.caption, styles.recapText, { color: c.text }]} numberOfLines={1}>
            {recapLine(recap)}
          </Text>
          <Text style={[styles.caption, styles.bold, { color: c.accent }]}>모임 기록 ›</Text>
        </Pressable>
      )}

      {/* 모임 시작 — 참석자를 그대로 오늘의 멤버로 앉히고 추천 화면으로 간다.
          "누구랑 하지"를 두 번 고르지 않게 하는 것이 이 버튼의 전부다. */}
      {today && !past && (
        <Pressable
          onPress={onStart}
          disabled={running || blocked}
          accessibilityRole="button"
          style={[
            styles.startButton,
            running || blocked
              ? { borderColor: c.border, borderWidth: 1 }
              : { backgroundColor: c.accent },
          ]}>
          <Icon name="dice" size={18} color={running || blocked ? c.textSecondary : c.onAccent} />
          <Text
            style={[
              styles.startText,
              { color: running || blocked ? c.textSecondary : c.onAccent },
            ]}>
            {running
              ? '이 모임 진행 중'
              : blocked
                ? '게임중이라 시작할 수 없어요'
                : startCount > 0
                  ? `이 모임 시작 (멤버 ${startCount}명)`
                  : '이 모임 시작'}
          </Text>
        </Pressable>
      )}
      {today && !past && !running && startCount < going.length && (
        <Text style={[styles.caption, { color: c.textSecondary }]}>
          참석자 {going.length}명 중 {startCount}명만 자동으로 들어와요 — 나머지는 다음 화면에서
          고르거나, 모임장이 &lsquo;사용자 관리 → 기록 잇기&rsquo;로 계정과 이어 주면 됩니다.
        </Text>
      )}

      {!past && (
        <View style={styles.rsvpRow}>
          {STATUSES.map((s) => {
            const on = meetup.myStatus === s;
            return (
              <Pressable
                key={s}
                onPress={() => onRsvp(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.rsvp,
                  {
                    backgroundColor: on ? c.accent : 'transparent',
                    borderColor: on ? c.accent : c.border,
                  },
                ]}>
                <Text style={[styles.rsvpText, { color: on ? c.onAccent : c.textSecondary }]}>
                  {RSVP_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * 일정 입력. 날짜·시간을 따로 받는다 —
 * 웹의 datetime-local은 RN TextInput으로 못 쓰고, 한 칸에 몰아 받으면 형식 실수가 잦다.
 * 만들기와 수정이 같은 폼을 쓴다(initial 유무로 갈린다).
 */
/** '이날 3판 · 사진 2장' — 남은 게 없으면 그렇다고 말한다. */
function recapLine(recap: Recap | undefined): string {
  if (!recap) return '모임 기록';
  const parts = [
    recap.plays > 0 ? `이날 ${recap.plays}판` : null,
    recap.photos > 0 ? `사진 ${recap.photos}장` : recap.posts > 0 ? `글 ${recap.posts}개` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '남은 판·사진이 없어요';
}

/** 목록 ↔ 달력 전환. 둘 중 하나만 켜지는 버튼 한 쌍이다. */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const c = useTheme();
  const items: { key: Mode; label: string; icon: 'list' | 'calendar' }[] = [
    { key: 'list', label: '목록', icon: 'list' },
    { key: 'calendar', label: '달력', icon: 'calendar' },
  ];
  return (
    <View style={[styles.toggle, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
      {items.map((item) => {
        const on = mode === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.toggleItem, on && { backgroundColor: c.accent }]}>
            <Icon name={item.icon} size={16} color={on ? c.onAccent : c.textSecondary} />
            <Text
              style={[styles.caption, styles.bold, { color: on ? c.onAccent : c.textSecondary }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 달력에서 고른 날의 일정 한 줄. 누르면 모임 페이지. */
function DayRow({
  meetup,
  recap,
  onPress,
}: {
  meetup: Meetup;
  recap: Recap | undefined;
  onPress: () => void;
}) {
  const c = useTheme();
  const going = meetup.rsvps.filter((r) => r.status === 'going').length;
  const details = [
    meetup.place,
    `참석 ${going}명`,
    meetup.isPast && recap && recap.plays > 0 ? `${recap.plays}판` : null,
    meetup.isPast && recap && recap.photos > 0 ? `사진 ${recap.photos}장` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meetup.title} 모임 보기`}
      style={({ pressed }) => [
        styles.dayRow,
        {
          backgroundColor: c.backgroundElement,
          borderColor: meetup.isPast ? c.border : c.accent,
        },
        pressed && styles.pressed,
      ]}>
      <Text
        style={[
          styles.caption,
          styles.bold,
          styles.dayTime,
          { color: meetup.isPast ? c.textSecondary : c.accent },
        ]}>
        {formatClock(meetup.startsAt)}
      </Text>
      <View style={styles.dayText}>
        <Text style={[styles.body, styles.bold, { color: c.text }]} numberOfLines={1}>
          {meetup.title}
        </Text>
        <Text style={[styles.caption, { color: c.textSecondary }]} numberOfLines={1}>
          {details.join(' · ')}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} color={c.textSecondary} />
    </Pressable>
  );
}

function MeetupComposer({
  initial,
  initialDate,
  pending,
  submitLabel = '일정 만들기',
  /** 팝업 안에서는 카드 테두리를 벗긴다 — 팝업이 이미 카드라 액자 안의 액자가 된다. */
  bare = false,
  onSubmit,
  onCancel,
}: {
  initial?: Meetup;
  /** 새로 만들 때 채워 둘 날짜(YYYY-MM-DD). 달력에서 날짜를 골라 열 때 쓴다 */
  initialDate?: string;
  pending: boolean;
  submitLabel?: string;
  bare?: boolean;
  onSubmit: (input: MeetupInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const c = useTheme();
  const touch = useTouch();
  const at = initial ? new Date(initial.startsAt) : null;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(at ? toDateValue(at) : (initialDate ?? localToday()));
  const [time, setTime] = useState(at ? toTimeValue(at) : '19:00');
  const [place, setPlace] = useState(initial?.place ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || pending) return;
    // 로컬 시각으로 해석시킨 뒤 ISO로 보낸다. 'Z'를 붙이면 9시간 어긋난다.
    // 형식은 피커가 보장하므로 여기서는 실제 날짜인지만 본다(2월 30일 같은 값).
    const when = new Date(`${date}T${time}:00`);
    if (Number.isNaN(when.getTime())) {
      setError('날짜와 시간을 확인해주세요.');
      return;
    }
    const cap = capacity.trim() ? Number(capacity) : null;
    if (cap !== null && (!Number.isInteger(cap) || cap <= 0)) {
      setError('정원은 1 이상의 숫자로 넣어주세요.');
      return;
    }
    setError(null);
    const ok = await onSubmit({
      title,
      startsAt: when.toISOString(),
      place: place || null,
      memo: memo || null,
      capacity: cap,
    });
    if (ok && !initial) {
      setTitle('');
      setPlace('');
      setCapacity('');
      setMemo('');
    }
  };

  const field = { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border };

  return (
    <View
      style={[
        styles.card,
        bare
          ? styles.bareCard
          : { backgroundColor: c.background, borderColor: c.accent, borderWidth: 1 },
      ]}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="무슨 모임인가요? (예: 8월 정기모임)"
        placeholderTextColor={c.textSecondary}
        style={[styles.input, field]}
      />
      {/* 날짜가 시간보다 길다("8월 26일 (수)" 대 "오후 7:00"). 반씩 나누면 날짜만 잘린다. */}
      <View style={styles.inputRow}>
        <View style={styles.dateField}>
          <DateTimeField mode="date" label="날짜" value={date} onChange={setDate} />
        </View>
        <View style={styles.timeField}>
          <DateTimeField mode="time" label="시간" value={time} onChange={setTime} />
        </View>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          value={place}
          onChangeText={setPlace}
          placeholder="장소 (선택)"
          placeholderTextColor={c.textSecondary}
          style={[styles.input, styles.flex, field]}
        />
        <TextInput
          value={capacity}
          onChangeText={setCapacity}
          placeholder="정원"
          placeholderTextColor={c.textSecondary}
          keyboardType="number-pad"
          style={[styles.input, styles.capInput, field]}
        />
      </View>
      <TextInput
        value={memo}
        onChangeText={setMemo}
        placeholder="메모 (선택)"
        placeholderTextColor={c.textSecondary}
        style={[styles.input, field]}
      />
      <View style={styles.composerActions}>
        {onCancel && (
          <Pressable onPress={onCancel} accessibilityRole="button" style={styles.cancelButton}>
            <Text style={[styles.caption, { color: c.textSecondary }]}>취소</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => void submit()}
          disabled={pending || !title.trim()}
          accessibilityRole="button"
          style={[
            styles.submit,
            {
              minHeight: touch.primary,
              backgroundColor: c.accent,
              opacity: pending || !title.trim() ? 0.4 : 1,
            },
          ]}>
          <Text style={[styles.newText, { color: c.onAccent }]}>{submitLabel}</Text>
        </Pressable>
      </View>
      {error && <Text style={[styles.caption, { color: c.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  header: { gap: Spacing.three },
  h1: { ...Typography.display },
  bold: { fontWeight: '700' },
  pressed: { opacity: 0.65 },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.full,
    padding: 3,
    gap: 2,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 34,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
  },
  dayPanel: { gap: Spacing.two },
  dayLabel: { ...Typography.subtitle },
  dayEmpty: { gap: Spacing.two, alignItems: 'flex-start' },
  dayCreate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: TouchTarget.primary,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  dayTime: { minWidth: 64 },
  dayText: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  titleText: { flexShrink: 1 },
  recapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget.min,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.one,
    paddingTop: Spacing.one,
  },
  recapText: { flex: 1, minWidth: 0, fontWeight: '600' },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
  },
  newText: { ...Typography.body, fontWeight: '700' },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  // 지난 모임은 흐리게 — 다가오는 일정이 한눈에 구분돼야 한다.
  pastCard: { opacity: 0.65 },
  // 메뉴가 아래 내용에 가리지 않게 머리말을 위 층으로 올린다.
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, zIndex: 20 },
  cardHeadText: { flex: 1, gap: Spacing.one },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dday: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.full },
  ddayText: { ...Typography.caption, fontWeight: '700' },
  when: { ...Typography.caption, flex: 1 },
  title: { ...Typography.subtitle },
  body: { ...Typography.body },
  caption: { ...Typography.caption },
  menuDots: { fontSize: 20, lineHeight: 24, fontWeight: '700' },
  // 메뉴를 카드 흐름 밖으로 띄우기 위한 기준점.
  menuAnchor: { position: 'relative' },
  menu: {
    position: 'absolute',
    top: TouchTarget.min,
    right: 0,
    minWidth: 120,
    zIndex: 10,
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  menuItem: {
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  iconButton: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  countText: { ...Typography.body, fontWeight: '700' },
  attendees: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  attendee: { alignItems: 'center', gap: 2, width: 52 },
  attendeeName: { fontSize: 11, lineHeight: 14 },
  spacer: { flex: 1 },
  shareButton: {
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
  },
  startText: { ...Typography.body, fontWeight: '700' },
  rsvpRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  rsvp: {
    flex: 1,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  rsvpText: { ...Typography.body, fontWeight: '600' },
  input: {
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  inputRow: { flexDirection: 'row', gap: Spacing.two },
  // minWidth 0이 없으면 flex 항목이 '내용 폭' 아래로 줄지 못한다(기본 min-width: auto).
  // 입력칸은 내용 폭이 넓어서, 이게 없으면 좁은 화면에서 옆 칸을 줄 밖으로 밀어낸다.
  flex: { flex: 1, minWidth: 0 },
  capInput: { width: 84, flexGrow: 0, flexShrink: 0 },
  dateField: { flex: 1.35, minWidth: 0 },
  timeField: { flex: 1, minWidth: 0 },
  // 팝업 안에서는 배경도 테두리도 팝업 것을 쓴다.
  bareCard: { padding: 0, borderWidth: 0, backgroundColor: 'transparent' },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cancelButton: {
    minHeight: TouchTarget.primary,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  submit: {
    flex: 1,
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
});
