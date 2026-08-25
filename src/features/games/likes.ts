import { useEffect, useSyncExternalStore } from 'react';

import { requireAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * 게임 하트 — "이거 하고 싶다 / 이거 사고 싶다".
 *
 * 게임 캐시(hooks.ts)와 따로 두는 이유: 하트는 로그인 상태에 딸린 데이터라
 * 로그인·로그아웃마다 다시 읽어야 하는데, 게임 목록까지 함께 버리면 화면이 통째로
 * 깜빡인다. 성격이 다른 두 캐시를 하나로 묶지 않는다.
 *
 * 낙관적 갱신을 한다. 하트는 실패해도 잃을 게 없는 동작이라, 서버를 기다렸다가
 * 채우면 "눌렀는데 반응이 없다"는 느낌만 남는다. 실패하면 조용히 되돌린다.
 */

type Store = {
  /**
   * gameId → 하트를 누른 사람들의 profile id.
   *
   * 사람 수만 세지 않고 '누구인지'까지 들고 있는다 — "오늘 온 사람들이 하고 싶어 하는
   * 게임"을 추천에 반영하려면 오늘 온 사람과 대조해야 하기 때문이다. 게임 150개에
   * 회원 열 명 남짓이라 다 들고 있어도 부담이 없다.
   */
  byGame: Map<string, Set<string>>;
  /** 내가 하트를 누른 gameId 집합 */
  mine: Set<string>;
  loaded: boolean;
};

let store: Store = { byGame: new Map(), mine: new Set(), loaded: false };
let inflight: Promise<void> | null = null;
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

/** 전체 하트를 한 번에 읽는다. 게임이 150개 남짓이라 행이 수백 개를 넘지 않는다. */
export function loadGameLikes(force = false): Promise<void> {
  if (inflight) return inflight;
  if (store.loaded && !force) return Promise.resolve();

  inflight = (async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id ?? null;

      const { data, error } = await supabase.from('game_likes').select('game_id, profile_id');
      if (error) throw new Error(error.message);

      const byGame = new Map<string, Set<string>>();
      const mine = new Set<string>();
      for (const row of data ?? []) {
        let who = byGame.get(row.game_id);
        if (!who) byGame.set(row.game_id, (who = new Set()));
        who.add(row.profile_id);
        if (uid && row.profile_id === uid) mine.add(row.game_id);
      }
      setStore({ byGame, mine, loaded: true });
    } catch {
      // 하트를 못 읽어도 게임 목록은 멀쩡히 보여야 한다. 0개로 두고 넘어간다.
      setStore({ loaded: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 로그인·로그아웃 때 부른다 — '내 하트'가 사람마다 다르므로 그대로 두면 남의 하트가 보인다. */
export function resetGameLikes() {
  store = { byGame: new Map(), mine: new Set(), loaded: false };
  listeners.forEach((l) => l());
}

function applyLocal(gameId: string, liked: boolean, uid: string) {
  const byGame = new Map(store.byGame);
  const mine = new Set(store.mine);
  const who = new Set(byGame.get(gameId) ?? []);
  if (liked) {
    who.add(uid);
    mine.add(gameId);
  } else {
    who.delete(uid);
    mine.delete(gameId);
  }
  byGame.set(gameId, who);
  setStore({ byGame, mine });
}

/** 하트를 뒤집는다. 반환: 성공 여부 (실패하면 화면 상태도 원래대로 되돌아간 뒤다) */
export async function toggleGameLike(gameId: string): Promise<boolean> {
  const liked = !store.mine.has(gameId);

  let uid: string | undefined;
  try {
    await requireAuth();
    const { data: session } = await supabase.auth.getSession();
    uid = session.session?.user.id;
    if (!uid) throw new Error('로그인이 필요합니다.');
    // 화면은 여기서부터 바꾼다 — 누구인지 알아야 '누가 눌렀는지' 목록도 함께 맞출 수 있다.
    applyLocal(gameId, liked, uid);

    const { error } = liked
      ? await supabase.from('game_likes').insert({ game_id: gameId, profile_id: uid })
      : await supabase.from('game_likes').delete().eq('game_id', gameId).eq('profile_id', uid);
    if (error) throw new Error(error.message);
    return true;
  } catch {
    if (uid) applyLocal(gameId, !liked, uid);
    return false;
  }
}

/**
 * 스토어 원본. 정렬처럼 Map 자체가 필요할 때 쓴다 —
 * useMemo 의존성에 넣어도 하트가 바뀔 때만 신원이 변한다.
 */
export function useGameLikeStore() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * 하트 상태. `count(gameId)`와 `mine(gameId)`로 게임 하나씩 물어본다.
 *
 * 게임 카드마다 훅을 하나씩 두면 150개가 각자 구독한다. 대신 화면당 한 번만
 * 구독하고 조회 함수를 내려보낸다.
 */
export function useGameLikes() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    void loadGameLikes();
  }, []);

  return {
    count: (gameId: string) => s.byGame.get(gameId)?.size ?? 0,
    mine: (gameId: string) => s.mine.has(gameId),
    loaded: s.loaded,
    toggle: toggleGameLike,
  };
}
