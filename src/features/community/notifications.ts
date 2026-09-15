import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

import { activityKey, useActivityKey } from './activity';
import { createListStore, useListStore } from './list-store';
import { fetchNotifications } from './queries';
import type { AppNotification } from './types';

/**
 * 알림함 — '내게 온 일' 목록과 어디까지 봤는지.
 *
 * 탭의 빨간 점(activity.ts)은 "피드에 뭔가 새로 생겼다"까지만 안다. 내 글에 누가 댓글을
 * 달았는지는 알려 주지 못한다. 그걸 모아 두는 곳이다.
 *
 * 목록은 글·댓글·일정·좋아요·참석 응답 중 무엇이든 새로 생기면(활동 시각이 바뀌면) 다시 받는다.
 * '모임 하루 전'처럼 시간이 흘러야 생기는 알림은 활동 시각으로 못 잡으므로, 받은 지 오래되면
 * 화면을 옮길 때 한 번 더 받는다(refreshInboxIfOld).
 */
const inboxStore = createListStore<AppNotification>(
  () => activityKey(),
  () => fetchNotifications()
);

/**
 * 어디까지 봤나 — 사람마다 따로 적는다. 태블릿 하나를 여럿이 번갈아 쓰면
 * 앞사람이 본 알림이 뒷사람 것까지 읽음으로 바뀌면 안 된다.
 */
const SEEN_KEY = 'meepick.inboxSeen';

type Seen = { uid: string | null; at: string | null; ready: boolean };

let seen: Seen = { uid: null, at: null, ready: false };
const listeners = new Set<() => void>();

function setSeen(next: Seen) {
  seen = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => seen;

let hydrating: Promise<void> | null = null;

/** 지금 로그인한 사람의 '본 시각'을 읽는다. 사람이 그대로면 다시 읽지 않는다. */
function hydrateSeen(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (seen.ready && seen.uid === uid) return;
      const at = uid ? await AsyncStorage.getItem(`${SEEN_KEY}.${uid}`) : null;
      setSeen({ uid, at, ready: true });
    } catch {
      // 못 읽으면 처음 쓰는 것으로 친다 — 아래 기준선이 잡혀 점이 쏟아지지는 않는다.
      setSeen({ uid: null, at: null, ready: true });
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

function writeSeen(at: string) {
  if (!seen.uid) return;
  setSeen({ ...seen, at });
  AsyncStorage.setItem(`${SEEN_KEY}.${seen.uid}`, at).catch(() => {
    // 유지되지 않으면 다음에 한 번 더 새 알림으로 보일 뿐이다.
  });
}

/**
 * 알림함을 봤다.
 *
 * 시각을 '지금'이 아니라 **받아 둔 가장 최근 알림 시각**으로 적는다 — 지금으로 적으면
 * 화면을 여는 사이에 생긴 알림까지 읽은 것이 되어 영영 못 보고 지나친다(activity.ts와 같은 이유).
 */
export function markInboxSeen() {
  const items = inboxStore.snapshot().data;
  if (!seen.ready || !items?.length) return;
  const newest = items[0].at;
  if (seen.at === null || newest > seen.at) writeSeen(newest);
}

/** 받은 지 5분이 넘었으면 다시 받는다. 탭 바가 화면을 옮길 때 부른다. */
export function refreshInboxIfOld() {
  inboxStore.refreshIfOlderThan(5 * 60_000);
}

export function useInbox(enabled: boolean) {
  const s = useListStore(inboxStore, useActivityKey(), enabled);
  const sn = useSyncExternalStore(subscribe, snapshot, snapshot);
  const empty = s.data === null;

  // 사람이 바뀌어 목록이 비워지면 '본 시각'도 그 사람 것으로 다시 읽는다.
  useEffect(() => {
    if (enabled) void hydrateSeen();
  }, [enabled, empty]);

  /**
   * 처음 쓰는 사람은 지금까지 온 것을 기준선으로 삼는다. 기능이 생기자마자 지난 한 달 치가
   * 전부 '새 알림'으로 뜨면 소음이다 — 목록에는 그대로 보이고, 표시만 새로 온 것부터 붙는다.
   */
  useEffect(() => {
    if (!enabled || !sn.ready || sn.at !== null || s.data === null) return;
    writeSeen(s.data[0]?.at ?? new Date().toISOString());
  }, [enabled, sn.ready, sn.at, s.data]);

  const items = enabled ? (s.data ?? []) : [];
  const seenAt = sn.ready ? sn.at : undefined;

  return {
    items,
    loading: enabled && s.data === null && !s.error,
    error: enabled ? s.error : null,
    reload: inboxStore.reload,
    /** 읽음 기준 시각. 아직 모르면 undefined, 처음 쓰는 사람이면 null */
    seenAt,
    hasUnread: enabled && !!seenAt && items.some((n) => n.at > seenAt),
  };
}
