import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { reloadGames, touchGameLastPlayed } from '@/features/games/hooks';
import { localToday } from '@/lib/dates';
import { supabaseConfigError } from '@/lib/supabase';

import {
  cancelPlay,
  createMember,
  deleteMember,
  deletePlay,
  endPlay,
  fetchActivePlay,
  fetchMembers,
  fetchPlayHistory,
  logPlay,
  renameMember,
  startPlay,
  updatePlayMembers,
  updatePlayRounds,
  type PlayWithGame,
} from './queries';
import type { Member, Play, PlayRound } from './types';

/**
 * 세션(오늘의 멤버 + 진행 중 플레이) 저장소.
 * games store와 같은 모듈 단위 공유 — 추천 화면·상세·카드가 같은 상태를 봐야 한다.
 *
 * 멤버 선택은 AsyncStorage에 남겨 새로고침을 넘기고, 게임중 상태는 DB(ended_at null)가
 * 진실이므로 재기동 시 활성 플레이에서 멤버를 복원한다.
 */
const STORAGE_KEY = 'meepick.sessionMemberIds';

type Store = {
  members: Member[] | null;
  memberIds: string[];
  activePlay: Play | null;
  /** 판 메모 초안 — 시트가 두 곳(추천 화면·상세)에 마운트되므로 로컬 state로 두면 갈라진다. */
  memoDraft: string;
  hydrated: boolean;
  skippedGate: boolean;
  error: string | null;
};

let store: Store = {
  members: null,
  memberIds: [],
  activePlay: null,
  memoDraft: '',
  hydrated: false,
  skippedGate: false,
  error: null,
};
const listeners = new Set<() => void>();

function setStore(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

let hydrating: Promise<void> | null = null;

function hydrate(force = false): Promise<void> {
  if (hydrating) return hydrating;
  if (store.hydrated && !force) return Promise.resolve();

  hydrating = (async () => {
    try {
      if (supabaseConfigError) throw new Error(supabaseConfigError);
      const [members, activePlay] = await Promise.all([fetchMembers(), fetchActivePlay()]);

      let memberIds = store.memberIds;
      if (activePlay) {
        // 게임중이면 그 판의 멤버가 오늘의 멤버다.
        memberIds = activePlay.memberIds;
      } else if (!memberIds.length) {
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            const saved: unknown = JSON.parse(raw);
            // 오늘 저장한 선택만 복원한다. 날짜 경계가 없으면 게이트가 최초 1회만 뜨고
            // 다음날부터는 어제 멤버가 무조건 자동 적용된다 — '오늘의 멤버'가 아니게 된다.
            if (
              typeof saved === 'object' &&
              saved !== null &&
              (saved as { savedOn?: unknown }).savedOn === localToday() &&
              Array.isArray((saved as { ids?: unknown }).ids)
            ) {
              const valid = new Set(members.map((m) => m.id));
              memberIds = ((saved as { ids: unknown[] }).ids).filter(
                (x): x is string => typeof x === 'string' && valid.has(x)
              );
            }
          }
        } catch {
          // 저장소를 못 읽으면 선택만 비어 있을 뿐이다. 게이트가 다시 뜨는 정도로 끝난다.
        }
      }

      setStore({ members, activePlay, memberIds, hydrated: true, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const friendly = /does not exist|schema cache/.test(msg)
        ? '플레이 기록 테이블이 아직 없습니다. supabase/migrations/20260811090000_members_and_plays.sql 을 SQL Editor에서 실행한 뒤 다시 시도하세요.'
        : msg;
      setStore({ hydrated: true, error: friendly });
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

function persistMemberIds(ids: string[]) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ids, savedOn: localToday() })).catch(() => {
    // 유지되지 않을 뿐 동작에는 지장 없다.
  });
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

/**
 * 플레이 기록 목록 (기록·명예의 전당 탭).
 * 판이 끝나거나 시작 취소되면(activePlay id 변화) 자동으로 다시 받는다.
 */
export function usePlayHistory() {
  const s = useStore();
  const [plays, setPlays] = useState<PlayWithGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    try {
      if (supabaseConfigError) throw new Error(supabaseConfigError);
      setPlays(await fetchPlayHistory());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const activePlayId = s.activePlay?.id ?? null;
  useEffect(() => {
    void reload();
  }, [reload, activePlayId]);

  const remove = useCallback(
    async (playId: string) => {
      setPending(true);
      try {
        await deletePlay(playId);
        setPlays((prev) => (prev ? prev.filter((p) => p.id !== playId) : prev));
        // 횟수가 줄어드는 방향은 캐시 증분으로 못 맞춘다. 목록을 다시 받아 집계를 재계산한다.
        void reloadGames();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setPending(false);
      }
    },
    []
  );

  /** 편집 저장 후 목록 항목만 교체한다. 게임 제목·표지는 기존 값을 유지한다. */
  const applyUpdate = useCallback((updated: Play) => {
    setPlays((prev) =>
      prev ? prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) : prev
    );
  }, []);

  return {
    plays: plays ?? [],
    loading: plays === null && !error,
    error,
    reload,
    remove,
    applyUpdate,
    pending,
  };
}

/** 카드 배지용 경량 셀렉터 — 지금 게임중인 게임 id. */
export function useActiveGameId(): string | null {
  const s = useStore();
  useEffect(() => {
    void hydrate();
  }, []);
  return s.activePlay?.gameId ?? null;
}

export function useSession() {
  const s = useStore();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setPending(true);
    setActionError(null);
    try {
      return await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  const members = useMemo(() => s.members ?? [], [s.members]);
  const sessionMembers = useMemo(
    () => s.memberIds.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m),
    [members, s.memberIds]
  );

  return {
    ready: s.hydrated,
    error: s.error,
    reload: useCallback(() => hydrate(true), []),

    members,
    memberIds: s.memberIds,
    sessionMembers,
    skippedGate: s.skippedGate,
    activePlay: s.activePlay,
    memoDraft: s.memoDraft,
    pending,
    actionError,

    setMemoDraft: useCallback((memoDraft: string) => setStore({ memoDraft }), []),

    /**
     * 오늘의 멤버 변경. 게임중이면 그 판의 member_ids도 함께 바꾼다 —
     * 안 바꾸면 중간에 합류한 사람을 우승자로 기록할 수 없고, 새로고침 시
     * hydrate가 플레이의 멤버로 되돌려 변경이 소리 없이 사라진다.
     */
    setMemberIds: useCallback(
      (ids: string[]) =>
        run(async () => {
          if (store.activePlay) {
            const updated = await updatePlayMembers(store.activePlay.id, ids);
            setStore({ activePlay: updated });
          }
          setStore({ memberIds: ids, skippedGate: false });
          persistMemberIds(ids);
          return true;
        }),
      [run]
    ),

    skipGate: useCallback(() => setStore({ skippedGate: true }), []),

    /**
     * 모임 마무리 — 오늘의 멤버를 비워 게이트로 돌아간다.
     * 저장된 선택도 지워, 새로고침해도 지난 모임 멤버가 되살아나지 않는다.
     * 게임중이면 끝낼 수 없다 — 진행 중인 판이 유령이 된다.
     */
    endSession: useCallback(() => {
      if (store.activePlay) return false;
      setStore({ memberIds: [], skippedGate: false, memoDraft: '' });
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {
        // 지워지지 않으면 다음 하이드레이션 때 날짜 경계가 걸러준다.
      });
      return true;
    }, []),

    addMember: useCallback(
      (name: string) =>
        run(async () => {
          const member = await createMember(name);
          setStore({ members: [...(store.members ?? []), member].sort((a, b) => a.name.localeCompare(b.name, 'ko')) });
          return member;
        }),
      [run]
    ),

    renameMember: useCallback(
      (id: string, name: string) =>
        run(async () => {
          const updated = await renameMember(id, name);
          setStore({
            members: (store.members ?? [])
              .map((m) => (m.id === id ? updated : m))
              .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
          });
          return updated;
        }),
      [run]
    ),

    removeMember: useCallback(
      (id: string) =>
        run(async () => {
          await deleteMember(id);
          setStore({
            members: (store.members ?? []).filter((m) => m.id !== id),
            memberIds: store.memberIds.filter((x) => x !== id),
          });
          persistMemberIds(store.memberIds);
          return true;
        }),
      [run]
    ),

    startPlay: useCallback(
      (gameId: string) =>
        run(async () => {
          if (store.activePlay) throw new Error('이미 진행 중인 게임이 있습니다. 먼저 종료하세요.');
          if (!store.memberIds.length) throw new Error('오늘의 멤버를 먼저 선택하세요.');
          const play = await startPlay(gameId, store.memberIds);
          setStore({ activePlay: play });
          return play;
        }),
      [run]
    ),

    addRound: useCallback(
      (round: PlayRound) =>
        run(async () => {
          const play = store.activePlay;
          if (!play) throw new Error('진행 중인 게임이 없습니다.');
          const updated = await updatePlayRounds(play.id, [...play.rounds, round]);
          setStore({ activePlay: updated });
          return updated;
        }),
      [run]
    ),

    removeRound: useCallback(
      (index: number) =>
        run(async () => {
          const play = store.activePlay;
          if (!play) throw new Error('진행 중인 게임이 없습니다.');
          const updated = await updatePlayRounds(
            play.id,
            play.rounds.filter((_, i) => i !== index)
          );
          setStore({ activePlay: updated });
          return updated;
        }),
      [run]
    ),

    endPlay: useCallback(
      (memo?: string) =>
        run(async () => {
          const play = store.activePlay;
          if (!play) throw new Error('진행 중인 게임이 없습니다.');
          const ended = await endPlay(play.id, memo);
          setStore({ activePlay: null, memoDraft: '' });
          // 서버가 games.last_played_at을 갱신했다(로컬 날짜 기준). 캐시도 맞춘다.
          touchGameLastPlayed(ended.gameId, localToday());
          return ended;
        }),
      [run]
    ),

    /**
     * 빠른 기록('오늘 이거 했어요') — 세션·게임중 없이 뒤늦게 한 판을 남긴다.
     * plays 행이 생기므로 횟수에 바로 잡힌다. 멤버가 선택돼 있으면 함께 기록한다.
     */
    quickLog: useCallback(
      (gameId: string) =>
        run(async () => {
          const play = await logPlay(gameId, store.memberIds);
          touchGameLastPlayed(gameId, localToday());
          return play;
        }),
      [run]
    ),

    cancelPlay: useCallback(
      () =>
        run(async () => {
          const play = store.activePlay;
          if (!play) return true;
          await cancelPlay(play.id);
          // 취소된 판의 메모 초안이 다음 판으로 넘어가면 안 된다.
          setStore({ activePlay: null, memoDraft: '' });
          return true;
        }),
      [run]
    ),
  };
}
