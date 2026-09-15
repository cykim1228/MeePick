import { Image } from 'expo-image';
import { usePathname } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { BackHeader, DETAIL_MAX_WIDTH } from '@/components/back-header';
import { Icon } from '@/components/icon';
import { MemberGate } from '@/components/member-gate';
import { EmptyView, ErrorView, LoadingView } from '@/components/state-views';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useMyProfile } from '@/features/community/hooks';
import { postImageUrl } from '@/features/community/images';
import { openMeetup, openPost } from '@/features/community/navigation';
import { markInboxSeen, useInbox } from '@/features/community/notifications';
import type { AppNotification, RsvpStatus } from '@/features/community/types';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import { dDay, formatMeetupTime, timeAgo } from '@/lib/dates';

const RSVP_PHRASE: Record<RsvpStatus, string> = {
  going: '참석한대요',
  maybe: '갈지도 모른대요',
  no: '못 간대요',
};

/**
 * 알림함 — `/notifications`.
 *
 * 들어올 때마다 '새 알림' 기준을 다시 잡는다. 탭 화면은 살아 있어서, 한 번 잡은 기준이
 * 다음 방문까지 남으면 지난번에 본 알림이 계속 새것으로 보인다.
 */
export default function NotificationsScreen() {
  const active = usePathname() === '/notifications';
  const [visit, setVisit] = useState(0);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setVisit((v) => v + 1);
  }
  return <Inbox key={visit} active={active} />;
}

function Inbox({ active }: { active: boolean }) {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const inbox = useInbox(me.isMember);

  // 들어온 순간의 읽음 기준. 보는 동안 표시가 곧바로 꺼지면 무엇이 새것이었는지 알 수 없다.
  const [baseline, setBaseline] = useState(inbox.seenAt);
  if (baseline === undefined && inbox.seenAt !== undefined) setBaseline(inbox.seenAt);

  // 화면을 보고 있으면 읽은 것으로 적는다 — 보는 동안 새로 온 것도 함께.
  useEffect(() => {
    if (active && baseline !== undefined && inbox.items.length > 0) markInboxSeen();
  }, [active, baseline, inbox.items]);

  const screen = [styles.screen, { backgroundColor: c.background, paddingTop: insets.top }];

  if (me.loading || (me.isMember && inbox.loading)) {
    return (
      <View style={screen}>
        <BackHeader title="알림" fallback="/feed" />
        <LoadingView />
      </View>
    );
  }

  if (!me.isMember) {
    return (
      <View style={screen}>
        <BackHeader title="알림" fallback="/feed" />
        <MemberGate />
      </View>
    );
  }

  if (inbox.error && inbox.items.length === 0) {
    return (
      <View style={screen}>
        <BackHeader title="알림" fallback="/feed" />
        <ErrorView message={inbox.error} onRetry={() => void inbox.reload()} />
      </View>
    );
  }

  const isNew = (n: AppNotification) => !!baseline && n.at > baseline;
  const fresh = inbox.items.filter(isNew);
  const older = inbox.items.filter((n) => !isNew(n));

  return (
    <View style={screen}>
      <BackHeader title="알림" fallback="/feed" />
      {inbox.items.length === 0 ? (
        <EmptyView
          title="아직 알림이 없어요"
          hint="내 글에 댓글이나 좋아요가 달리거나 새 일정이 생기면 여기에 모여요."
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}>
          {fresh.length > 0 && (
            <>
              <Text style={[t.label, styles.section, { color: c.accent }]}>새 알림</Text>
              {fresh.map((n) => (
                <NotificationRow key={n.id} n={n} isNew />
              ))}
            </>
          )}
          {older.length > 0 && (
            <>
              <Text style={[t.label, styles.section, { color: c.textSecondary }]}>
                {fresh.length > 0 ? '이전 알림' : '최근 30일'}
              </Text>
              {older.map((n) => (
                <NotificationRow key={n.id} n={n} isNew={false} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** 알림 한 줄. 누르면 그 일이 일어난 곳(글 또는 모임)으로 간다. */
function NotificationRow({ n, isNew }: { n: AppNotification; isNew: boolean }) {
  const c = useTheme();
  const t = useType();

  const actor = n.actors[0];
  const name = actor?.displayName ?? '';
  const others = n.actors.length - 1;
  const title = n.meetup?.title ?? '';
  const b = (text: string) => <Text style={styles.bold}>{text}</Text>;

  let message: ReactNode = null;
  switch (n.kind) {
    case 'comment':
      message = (
        <>
          {b(name)}님이 댓글을 남겼어요{n.commentText ? `: “${n.commentText}”` : ''}
        </>
      );
      break;
    case 'like':
      message = (
        <>
          {b(name)}님{others > 0 ? ` 외 ${others}명이` : '이'} 회원님의 글을 좋아해요
        </>
      );
      break;
    case 'meetup':
      message = (
        <>
          {b(name)}님이 새 일정을 만들었어요 · {b(title)}
        </>
      );
      break;
    case 'rsvp':
      message = (
        <>
          {b(name)}님이 {b(title)}에 {n.rsvpStatus ? RSVP_PHRASE[n.rsvpStatus] : '답했어요'}
        </>
      );
      break;
    case 'soon':
      message = (
        <>
          {b(n.meetup ? dDay(n.meetup.startsAt) : '')} 모임이에요 · {b(title)}
        </>
      );
      break;
  }

  // 일정 알림은 '언제 알렸나'보다 '모임이 언제인가'가 궁금하다.
  const sub =
    n.kind === 'soon' && n.meetup
      ? `${formatMeetupTime(n.meetup.startsAt)}${n.meetup.place ? ` · ${n.meetup.place}` : ''}`
      : n.kind === 'meetup' && n.meetup
        ? `${timeAgo(n.at)} · ${formatMeetupTime(n.meetup.startsAt)}`
        : timeAgo(n.at);

  const onPress = () => {
    if (n.postId) openPost(n.postId);
    else if (n.meetup) openMeetup(n.meetup.id);
  };

  const thumb = n.postImage ? postImageUrl(n.postImage) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        isNew && { backgroundColor: c.backgroundElement },
        pressed && styles.pressed,
      ]}>
      {n.kind === 'soon' || !actor ? (
        <View style={[styles.iconCircle, { backgroundColor: c.accent }]}>
          <Icon name="calendar" size={20} color={c.onAccent} />
        </View>
      ) : (
        <Avatar profile={actor} size={40} />
      )}

      <View style={styles.text}>
        <Text style={[t.body, { color: c.text }]} numberOfLines={3}>
          {message}
        </Text>
        <Text style={[t.caption, { color: isNew ? c.accent : c.textSecondary }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>

      {thumb ? (
        <Image
          source={{ uri: thumb }}
          style={[styles.thumb, { backgroundColor: c.backgroundSelected }]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : n.meetup ? (
        <Icon name="chevronRight" size={16} color={c.textSecondary} />
      ) : null}
      {isNew && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingVertical: Spacing.two,
    maxWidth: DETAIL_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: TouchTarget.primary,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  pressed: { opacity: 0.6 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  bold: { fontWeight: '700' },
  thumb: { width: 44, height: 44, borderRadius: Radius.sm },
  dot: { position: 'absolute', left: Spacing.one, width: 6, height: 6, borderRadius: Radius.full },
});
