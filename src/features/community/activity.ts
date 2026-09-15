import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * "뭐 새로 생겼나" — 탭에 붙는 작은 점.
 *
 * 푸시 알림을 쓸 수 없는 지금(LAN 전용 http에서는 서비스 워커가 아예 등록되지 않는다),
 * 사람들이 새 글을 알아채는 유일한 방법은 직접 들어와 보는 것이다. 점 하나면
 * "들어와 볼 이유"가 생긴다.
 *
 * 글 목록 전체를 받아 비교하지 않는다 — 탭 바는 어느 화면에서든 떠 있어서, 여기서
 * 피드를 통째로 받으면 앱이 켜질 때마다 목록을 두 번 받게 된다. 테이블마다
 * **가장 최근 시각 한 줄씩**만 물어본다.
 */
const SEEN_KEY = 'meepick.lastSeen';

export type ActivityTab = 'feed' | 'meetups';

type Store = {
  /** 피드 쪽에서 가장 최근에 일어난 일(글 또는 댓글) */
  feedAt: string | null;
  meetupAt: string | null;
  /**
   * 좋아요·참석 응답이 마지막으로 생긴 시각. 탭의 점에는 쓰지 않는다 — 남의 글에 달린 좋아요로
   * 피드에 점이 켜지면 소음이다. 알림함이 "내게 온 게 있나" 다시 받을 때만 본다.
   */
  likeAt: string | null;
  rsvpAt: string | null;
  /** 활동 시각을 한 번이라도 읽어 왔는가. '아직 모름'과 '활동이 없음(null)'을 가른다 */
  fetched: boolean;
  /** 탭별로 마지막으로 열어 본 시각 */
  seen: Record<ActivityTab, string | null>;
  ready: boolean;
};

let store: Store = {
  feedAt: null,
  meetupAt: null,
  likeAt: null,
  rsvpAt: null,
  fetched: false,
  seen: { feed: null, meetups: null },
  ready: false,
};
const listeners = new Set<() => void>();

function setStore(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => store;

/** 한 테이블의 가장 최근 created_at. 권한이 없거나 비어 있으면 null. */
async function latest(
  table: 'posts' | 'post_comments' | 'meetups' | 'post_likes' | 'meetup_rsvps'
): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return (data[0] as { created_at: string }).created_at;
}

let inflight: Promise<void> | null = null;

/** 활동 시각을 다시 읽는다. 회원이 아니면 RLS에 막혀 전부 null이 되고 점도 안 뜬다. */
export function refreshActivity(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [post, comment, meetup, like, rsvp] = await Promise.all([
        latest('posts'),
        latest('post_comments'),
        latest('meetups'),
        latest('post_likes'),
        latest('meetup_rsvps'),
      ]);
      // 글과 댓글 중 더 최근 것이 '피드에서 일어난 마지막 일'이다.
      const feedAt = [post, comment].filter(Boolean).sort().pop() ?? null;
      setStore({ feedAt, meetupAt: meetup, likeAt: like, rsvpAt: rsvp, fetched: true });
    } catch {
      // 못 읽으면 점이 안 뜰 뿐이다. 화면을 막을 일이 아니다.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

let hydrating: Promise<void> | null = null;

/** 저장된 '마지막으로 본 시각'을 읽어 온다. 여러 번 불러도 한 번만 읽는다. */
function hydrateSeen(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
      try {
      const raw = await AsyncStorage.getItem(SEEN_KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        const s = saved as Partial<Record<ActivityTab, unknown>>;
        setStore({
          seen: {
            feed: typeof s.feed === 'string' ? s.feed : null,
            meetups: typeof s.meetups === 'string' ? s.meetups : null,
          },
          ready: true,
        });
        return;
      }
    } catch {
      // 저장소를 못 읽으면 처음 열어 보는 것으로 친다.
    }
    setStore({ ready: true });
  })();
  return hydrating;
}

/**
 * 그 탭을 지금 봤다고 표시한다.
 *
 * 시각을 '지금'이 아니라 **알고 있는 마지막 활동 시각**으로 적는다. 지금으로 적으면
 * 화면을 여는 사이에 올라온 글까지 읽은 것이 되어 영영 못 보고 지나친다.
 */
export function markSeen(tab: ActivityTab) {
  const at = tab === 'feed' ? store.feedAt : store.meetupAt;
  if (!at || store.seen[tab] === at) return;
  const seen = { ...store.seen, [tab]: at };
  setStore({ seen });
  AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen)).catch(() => {
    // 유지되지 않으면 다음에 점이 한 번 더 뜰 뿐이다.
  });
}

/**
 * 그 탭 화면에서 부른다 — 화면을 보고 있는 동안 새 활동이 들어오면 곧바로 '봤다'로 넘긴다.
 *
 * 화면이 뜰 때 한 번만 적으면 안 되는 이유가 둘이다.
 *   1) 탭 화면은 옮겨 다녀도 **마운트된 채 남는다.** 다시 돌아와도 마운트 시점의 effect는
 *      다시 돌지 않아, 점이 켜진 채로 굳는다.
 *   2) 댓글이 달려도 **글 개수는 그대로**다. 목록 길이를 조건으로 삼으면 댓글로 켜진 점은
 *      영영 꺼지지 않는다.
 * 그래서 '화면에 있는가'와 '마지막 활동 시각'을 함께 본다.
 */
export function useMarkSeen(tab: ActivityTab, active: boolean) {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const at = tab === 'feed' ? s.feedAt : s.meetupAt;

  useEffect(() => {
    if (!active || !at) return;
    void hydrateSeen().then(() => markSeen(tab));
  }, [tab, active, at]);
}

/**
 * 그 탭에서 가장 최근에 일어난 일의 시각. 아직 한 번도 읽지 않았으면 undefined.
 *
 * 목록 캐시가 "내가 받은 뒤로 새로 올라온 게 있나"를 판단할 때 쓴다 — 목록을 통째로
 * 다시 받아 비교하지 않고, 이미 탭 바가 받아 둔 시각 한 줄과 견준다.
 */
export function activityAt(tab: ActivityTab): string | null | undefined {
  if (!store.fetched) return undefined;
  return tab === 'feed' ? store.feedAt : store.meetupAt;
}

/**
 * 알림함이 따라가는 시각 — 글·댓글·일정·좋아요·참석 응답 중 무엇이든 새로 생기면 바뀐다.
 * 아직 한 번도 읽지 않았으면 undefined.
 */
export function activityKey(): string | undefined {
  if (!store.fetched) return undefined;
  return keyOf(store);
}

export function useActivityKey(): string | undefined {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!s.fetched) return undefined;
  return keyOf(s);
}

function keyOf(s: Store): string {
  return [s.feedAt, s.meetupAt, s.likeAt, s.rsvpAt].map((v) => v ?? '-').join('|');
}

/** activityAt의 구독판. 값이 바뀌면 다시 그린다. */
export function useActivityAt(tab: ActivityTab): string | null | undefined {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!s.fetched) return undefined;
  return tab === 'feed' ? s.feedAt : s.meetupAt;
}

/** 탭 바에서 쓴다. 회원이 아니면 항상 false — 어차피 내용이 보이지 않는다. */
export function useUnread(enabled: boolean) {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      await hydrateSeen();
      await refreshActivity();
      // 처음 쓰는 사람은 '지금'을 기준선으로 삼는다. 안 그러면 가입하자마자
      // 모든 탭에 점이 붙어, 지난 몇 달치 글을 다 읽어야 사라진다.
      if (store.seen.feed === null) markSeen('feed');
      if (store.seen.meetups === null) markSeen('meetups');
    })();
  }, [enabled]);

  const has = (tab: ActivityTab) => {
    if (!enabled || !s.ready) return false;
    const at = tab === 'feed' ? s.feedAt : s.meetupAt;
    if (!at) return false;
    const seen = s.seen[tab];
    // 처음 여는 사람에게까지 점을 띄우지 않는다 — 가입하자마자 모든 탭이 빨간 건 소음이다.
    return seen !== null && at > seen;
  };

  return { feed: has('feed'), meetups: has('meetups') };
}
