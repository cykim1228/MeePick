import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabaseConfigError } from '@/lib/supabase';

import { fetchPlayCounts } from '@/features/plays/queries';

import type { GameInput } from './mappers';
import { createGame, deleteGame, fetchOwnedGames, fetchWishlistGames, updateGame } from './queries';
import { applyFilter } from './recommend';
import type { Game, GameFilter } from './types';

/**
 * 소장 목록은 155종뿐이고 화면 여러 곳에서 같은 데이터를 쓴다.
 * 화면마다 다시 불러오면 필터를 바꿀 때마다 네트워크를 타므로 모듈 단위로 한 번만 받아 공유한다.
 * react-query 같은 라이브러리를 넣을 만큼 복잡하지 않아 최소 구현으로 둔다.
 */
type Store = { games: Game[] | null; error: string | null; loading: boolean };

let store: Store = { games: null, error: null, loading: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setStore(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

function load(force = false): Promise<void> {
  if (inflight) return inflight;
  if (store.games && !force) return Promise.resolve();

  setStore({ loading: true, error: null });
  inflight = (async () => {
    try {
      // 환경 변수가 없으면 supabase-js가 모호한 네트워크 오류를 던진다. 먼저 걸러 원인을 알린다.
      if (supabaseConfigError) throw new Error(supabaseConfigError);
      const [games, counts] = await Promise.all([
        fetchOwnedGames(),
        // 횟수 집계 실패가 목록 열람까지 막으면 안 된다. 실패하면 0회로 보일 뿐이다.
        fetchPlayCounts().catch(() => new Map<string, number>()),
      ]);
      setStore({
        games: games.map((g) => ({ ...g, playCount: counts.get(g.id) ?? 0 })),
        loading: false,
      });
    } catch (e) {
      setStore({ error: e instanceof Error ? e.message : String(e), loading: false });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function useStore(): Store {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return store;
}

/** 목록·횟수 집계 강제 재조회. 기록 삭제처럼 횟수가 줄어드는 경우 캐시 증분으로는 못 맞춘다. */
export function reloadGames() {
  return load(true);
}

/**
 * 플레이가 기록됐을 때(end_play/log_play RPC 성공 후) 목록을 다시 받지 않고
 * 캐시만 맞추기 위한 진입점. plays 훅이 호출한다. 날짜 갱신과 횟수 +1을 함께 한다 —
 * 호출처 둘 다 새 plays 행 하나가 생긴 직후이기 때문이다.
 */
export function touchGameLastPlayed(gameId: string, playedOn: string) {
  if (!store.games) return;
  setStore({
    games: store.games.map((g) =>
      g.id === gameId ? { ...g, lastPlayedAt: playedOn, playCount: g.playCount + 1 } : g
    ),
  });
}

/** 소장 게임 전체. 필터를 넘기면 필터·정렬까지 적용된 결과를 돌려준다. */
export function useGames(filter?: GameFilter) {
  const { games, error, loading } = useStore();

  useEffect(() => {
    void load();
  }, []);

  const all = useMemo(() => games ?? [], [games]);
  const filtered = useMemo(() => (filter ? applyFilter(all, filter) : all), [all, filter]);

  return {
    all,
    games: filtered,
    loading: loading || games === null,
    error,
    reload: useCallback(() => load(true), []),
  };
}

export function useGame(id: string | undefined) {
  const { all, loading, error } = useGames();
  const game = useMemo(() => all.find((g) => g.id === id) ?? null, [all, id]);
  return { game, loading, error };
}

/**
 * 게임 추가·수정·삭제.
 *
 * 저장 후 목록 전체를 다시 받지 않고 캐시의 해당 항목만 손본다.
 * 155종을 매번 다시 받으면 저장할 때마다 화면이 로딩으로 깜빡인다.
 */
export function useEditGame() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>, apply: (result: T) => void) => {
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      apply(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  const create = useCallback(
    (input: GameInput) =>
      run(
        () => createGame(input),
        (game) => {
          // 미소장으로 추가하면 소장 목록에는 넣지 않는다. 목록의 의미가 흐려진다.
          if (store.games && game.owned) setStore({ games: [...store.games, game] });
        }
      ),
    [run]
  );

  const update = useCallback(
    (id: string, input: GameInput) =>
      run(
        () => updateGame(id, input),
        (game) => {
          if (!store.games) return;
          // 서버 응답에는 집계 필드(playCount)가 없다. 캐시 값을 잃지 않게 이어붙인다.
          const prev = store.games.find((g) => g.id === game.id);
          const merged = { ...game, playCount: prev?.playCount ?? 0 };
          const without = store.games.filter((g) => g.id !== game.id);
          setStore({ games: merged.owned ? [...without, merged] : without });
        }
      ),
    [run]
  );

  const remove = useCallback(
    (id: string) =>
      run(
        () => deleteGame(id),
        () => {
          if (store.games) setStore({ games: store.games.filter((g) => g.id !== id) });
        }
      ),
    [run]
  );

  return { create, update, remove, pending, error };
}

/**
 * 위시리스트(미소장). 소장 목록과 성격이 달라 별도로 불러온다.
 * 위시 게임을 수정해 소장으로 바꾸면 이 목록이 낡으므로 reload를 함께 노출한다.
 */
export function useWishlist() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      if (supabaseConfigError) throw new Error(supabaseConfigError);
      setGames(await fetchWishlistGames());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { games: games ?? [], loading: games === null && !error, error, reload };
}
