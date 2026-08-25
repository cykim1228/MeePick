import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DateTimeField, toDateValue, toTimeValue } from '@/components/date-time-picker';
import { Icon } from '@/components/icon';
import { MemberGate } from '@/components/member-gate';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Shadow, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { markSeen, refreshActivity } from '@/features/community/activity';
import { useMeetups, useMyProfile } from '@/features/community/hooks';
import type { MeetupInput } from '@/features/community/queries';
import { RSVP_LABEL, type Meetup, type RsvpStatus } from '@/features/community/types';
import { useSession } from '@/features/plays/hooks';
import { useMenuToggle } from '@/hooks/use-confirm-once';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { appOrigin, copyText } from '@/lib/clipboard';
import { dDay, formatMeetupTime, localDateOf, localToday } from '@/lib/dates';

const STATUSES: RsvpStatus[] = ['going', 'maybe', 'no'];

export default function MeetupsScreen() {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const { profile, loading: profileLoading, isMember } = useMyProfile();
  const list = useMeetups(isMember);
  const session = useSession();
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * 이 화면을 열면 '봤다'고 적는다. 목록이 도착한 뒤에 적어야 —
   * 화면을 여는 사이 올라온 글까지 읽은 것으로 넘어가지 않는다.
   */
  useEffect(() => {
    void refreshActivity().then(() => markSeen('meetups'));
  }, [list.meetups.length]);

  /**
   * 일정에서 모임을 시작한다 — 참석(갈게요)한 사람을 그대로 오늘의 멤버로 앉히고
   * 추천 화면으로 보낸다. 여기까지 오면 "누구랑 하지"를 다시 고를 이유가 없다.
   */
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

  return (
    <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <FlatList
        data={list.meetups}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.six }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={[styles.h1, t.display, { color: c.text }]}>모임 일정</Text>
                <Text style={[styles.caption, { color: c.textSecondary }]}>
                  {upcoming > 0 ? `예정된 모임 ${upcoming}개` : '예정된 모임이 없어요'}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setComposing((v) => !v);
                  setEditingId(null);
                }}
                accessibilityRole="button"
                style={[styles.newButton, { backgroundColor: c.accent }]}>
                <Icon name={composing ? 'close' : 'plus'} size={18} color={c.onAccent} />
                <Text style={[styles.newText, { color: c.onAccent }]}>
                  {composing ? '닫기' : '일정'}
                </Text>
              </Pressable>
            </View>
            {composing && (
              <MeetupComposer
                pending={list.pending}
                onSubmit={async (input) => {
                  const ok = await list.create(input);
                  if (ok) setComposing(false);
                  return ok;
                }}
              />
            )}
            {list.error && <Text style={[styles.caption, { color: c.danger }]}>{list.error}</Text>}
          </View>
        }
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
            <EmptyView title="예정된 모임이 없어요" hint="'+ 일정'으로 다음 모임을 잡아보세요." />
          )
        }
      />
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
  onStart: () => void;
  onRsvp: (s: RsvpStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const c = useTheme();
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
        <View style={styles.cardHeadText}>
          <View style={styles.whenRow}>
            <View
              style={[
                styles.dday,
                { backgroundColor: past ? c.backgroundSelected : soon ? c.accent : c.badgeRecommended },
              ]}>
              <Text style={[styles.ddayText, { color: past ? c.textSecondary : c.onAccent }]}>
                {dDay(meetup.startsAt)}
              </Text>
            </View>
            <Text style={[styles.when, { color: c.textSecondary }]} numberOfLines={1}>
              {formatMeetupTime(meetup.startsAt)}
            </Text>
          </View>
          <Text style={[styles.title, { color: c.text }]}>{meetup.title}</Text>
          {!!meetup.place && (
            <Text style={[styles.body, { color: c.textSecondary }]}>{meetup.place}</Text>
          )}
        </View>
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
          {meetup.capacity !== null ? `/${meetup.capacity}` : ''}명
          {full ? ' · 정원 참' : ''}
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
            <View key={r.profile.id} style={styles.attendee}>
              <Avatar profile={r.profile} size={28} />
              <Text style={[styles.attendeeName, { color: c.textSecondary }]} numberOfLines={1}>
                {r.profile.displayName}
              </Text>
            </View>
          ))}
        </View>
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
          <Icon
            name="dice"
            size={18}
            color={running || blocked ? c.textSecondary : c.onAccent}
          />
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
function MeetupComposer({
  initial,
  pending,
  submitLabel = '일정 만들기',
  onSubmit,
  onCancel,
}: {
  initial?: Meetup;
  pending: boolean;
  submitLabel?: string;
  onSubmit: (input: MeetupInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const c = useTheme();
  const at = initial ? new Date(initial.startsAt) : null;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(at ? toDateValue(at) : localToday());
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
    <View style={[styles.card, { backgroundColor: c.background, borderColor: c.accent, borderWidth: 1 }]}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="무슨 모임인가요? (예: 8월 정기모임)"
        placeholderTextColor={c.textSecondary}
        style={[styles.input, field]}
      />
      <View style={styles.inputRow}>
        <View style={styles.flex}>
          <DateTimeField mode="date" label="날짜" value={date} onChange={setDate} />
        </View>
        <View style={styles.flex}>
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
            { backgroundColor: c.accent, opacity: pending || !title.trim() ? 0.4 : 1 },
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headerText: { flex: 1, gap: Spacing.one },
  h1: { ...Typography.display },
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
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cancelButton: { minHeight: TouchTarget.primary, justifyContent: 'center', paddingHorizontal: Spacing.two },
  submit: {
    flex: 1,
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
});
