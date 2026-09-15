import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * 여러 화면이 함께 보는 목록 — 피드·일정·알림.
 *
 * 화면마다 따로 받으면 한 곳에서 바꾼 것이 다른 화면에 남는다. 탭 화면은 옮겨 다녀도
 * 마운트된 채 남기 때문에, 프로필 격자에서 글을 열어 지우고 돌아오면 격자에 그 글이 그대로
 * 있고, 피드는 새로고침하기 전까지 처음 받은 목록에 굳는다. 그래서 목록을 모듈에 하나 두고
 * 모든 화면이 구독한다.
 *
 * 새로 생긴 것은 탭 바가 이미 받아 오는 **마지막 활동 시각**(activity.ts)으로 알아챈다.
 * 목록을 받을 때의 시각(stamp)과 지금 시각이 다르면 다시 받는다 — 목록을 통째로 받아 비교하지 않는다.
 */
type ListState<T> = { data: T[] | null; error: string | null; pending: boolean };

/** 사람이 바뀌면 전부 비워야 하므로 만든 목록을 기억해 둔다. */
const stores = new Set<{ reset: () => void }>();

export function createListStore<T>(
  stamp: () => string | null | undefined,
  load: () => Promise<T[]>
) {
  let state: ListState<T> = { data: null, error: null, pending: false };
  const subscribers = new Set<() => void>();
  /** 늦게 시작한 조회가 이긴다 — 쓰기 직후의 조회가 그 전에 떠난 조회에 덮이면 안 된다. */
  let seq = 0;
  let loading = false;
  /** 들고 있는 목록이 어느 활동 시각까지를 담았는가. undefined면 받을 때 시각을 몰랐다. */
  let loadedAt: string | null | undefined;
  /** 마지막으로 받기를 끝낸 때(ms). 활동 시각으로 못 잡는 변화(시간이 흘러 생기는 알림)에 쓴다. */
  let loadedMs = 0;

  const set = (next: Partial<ListState<T>>) => {
    state = { ...state, ...next };
    subscribers.forEach((l) => l());
  };

  const reload = async () => {
    const mine = ++seq;
    loading = true;
    const atStart = stamp();
    // 떠날 때 시각을 먼저 적는다. 받는 사이에 새 활동이 오면 그것과 달라서 다시 받게 된다.
    if (atStart !== undefined) loadedAt = atStart;
    try {
      const data = await load();
      if (mine !== seq) return;
      if (atStart === undefined) loadedAt = stamp();
      loadedMs = Date.now();
      set({ data, error: null });
    } catch (e) {
      if (mine !== seq) return;
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (mine === seq) loading = false;
    }
  };

  const store = {
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    snapshot: () => state,
    reload,
    /** 아직 아무것도 없을 때만 받는다. 화면 여럿이 동시에 불러도 한 번이다. */
    ensure() {
      if (state.data === null && !loading) void reload();
    },
    /** 활동 시각이 바뀌었으면 다시 받는다. 같은 변화로 화면 여럿이 불러도 한 번만 받는다. */
    refreshIfStale(at: string | null | undefined) {
      if (at === undefined) return;
      if (state.data === null && !loading) return;
      if (loadedAt === undefined) {
        // 받을 때 시각을 몰랐다 — 받기가 끝나면서 기준을 잡거나, 지금 값을 기준으로 삼는다.
        if (!loading) loadedAt = at;
        return;
      }
      if (at === loadedAt) return;
      loadedAt = at;
      void reload();
    },
    /** 받은 지 오래됐으면 다시 받는다. */
    refreshIfOlderThan(ms: number) {
      if (state.data === null || loading) return;
      if (Date.now() - loadedMs > ms) void reload();
    },
    /** 쓰기 → 다시 받기. 실패하면 화면에 남길 문구를 적고 false. */
    async run(fn: () => Promise<unknown>) {
      set({ pending: true, error: null });
      try {
        await fn();
        await reload();
        return true;
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        set({ pending: false });
      }
    },
    /** 받아 둔 목록을 그 자리에서 고친다(낙관적 갱신). */
    mutate(fn: (data: T[]) => T[]) {
      if (state.data !== null) set({ data: fn(state.data) });
    },
    setError(error: string | null) {
      set({ error });
    },
    /** 사람이 바뀌었다 — 남의 '좋아요 누름' 상태가 보이면 안 된다. 진행 중인 조회도 버린다. */
    reset() {
      seq += 1;
      loading = false;
      loadedAt = undefined;
      loadedMs = 0;
      set({ data: null, error: null, pending: false });
    },
  };
  stores.add(store);
  return store;
}

export type ListStore<T> = ReturnType<typeof createListStore<T>>;

/**
 * 목록 구독 + 첫 조회 + 새 활동 반영.
 * at은 그 목록이 따라가는 활동 시각이다. enabled가 false면(회원 아님) 아무것도 받지 않는다.
 */
export function useListStore<T>(
  store: ListStore<T>,
  at: string | null | undefined,
  enabled: boolean
) {
  const s = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const empty = s.data === null;

  useEffect(() => {
    // 사람이 바뀌어 목록이 비워지면(empty) 다시 받는다.
    if (enabled && empty) store.ensure();
  }, [store, enabled, empty]);

  useEffect(() => {
    if (enabled) store.refreshIfStale(at);
  }, [store, enabled, at]);

  return s;
}

/** 로그인한 사람이 바뀌면 목록을 비운다. 토큰 갱신처럼 같은 사람이면 그대로 둔다. */
let listOwner: string | null | undefined;
supabase.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user.id ?? null;
  const changed = listOwner !== undefined && listOwner !== uid;
  listOwner = uid;
  if (!changed) return;
  // supabase는 인증 락을 쥔 채 이 콜백을 부른다. 비우면 화면이 곧바로 다시 받으려
  // supabase를 부르므로, 락이 풀린 다음 틱으로 미룬다(hooks.ts의 같은 구독과 같은 이유).
  setTimeout(() => stores.forEach((s) => s.reset()), 0);
});
