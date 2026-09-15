import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { loadGameLikes, resetGameLikes } from '@/features/games/likes';
import { supabase } from '@/lib/supabase';

import { activityAt, useActivityAt } from './activity';
import { createListStore, useListStore } from './list-store';

import {
  addComment,
  createMeetup,
  createPost,
  deleteComment,
  deleteMeetup,
  deletePost,
  fetchComments,
  fetchMeetups,
  fetchMyProfile,
  fetchPosts,
  setRsvp,
  toggleLike,
  updateMeetup,
  updatePost,
  updateProfile,
  type MeetupInput,
  type PostInput,
} from './queries';
import type { Comment, Meetup, Post, Profile, RsvpStatus } from './types';

/**
 * 내 회원 정보 — 화면 여러 곳(앱 바·피드·일정)이 같은 값을 봐야 해서 모듈 단위로 공유한다.
 *
 * 세 가지 상태를 구분한다:
 *   loading  아직 확인 중
 *   null     로그인 안 했거나, 로그인은 했지만 초대 코드를 안 쓴 사람 → 회원이 아니다
 *   Profile  회원
 */
let profileStore: { profile: Profile | null; loading: boolean } = { profile: null, loading: true };
const listeners = new Set<() => void>();

function setProfile(next: Partial<typeof profileStore>) {
  // 객체를 새로 만든다 — useSyncExternalStore가 참조 비교로 변경을 감지한다.
  profileStore = { ...profileStore, ...next };
  listeners.forEach((l) => l());
}

function subscribeProfile(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getProfileSnapshot() {
  return profileStore;
}

/**
 * 조회 순번. 늦게 시작한 조회가 항상 이긴다.
 *
 * 진행 중인 조회를 재사용(dedup)하면 안 된다 — 가입 순간이 정확히 그 함정이다:
 * 로그인 이벤트가 조회를 시작하고(그 시점엔 프로필이 아직 없다),
 * 곧이어 참여 코드가 등록되어 프로필이 생긴다. 이때 재조회가 앞선 조회를 재사용하면
 * "회원 아님"이라는 낡은 결과가 그대로 굳어, 가입했는데도 피드가 잠긴다.
 */
let seq = 0;
/** 실제로 화면에 반영된 조회 번호. **시작한** 번호가 아니라 **끝난** 번호다. */
let applied = 0;
let started = false;

export function reloadProfile(knownUid?: string | null): Promise<void> {
  const mine = ++seq;

  /**
   * 시작 순번이 아니라 '완료된 것 중 최신'을 채택한다.
   *
   * 시작 순번으로 비교하면, 늦게 시작한 조회가 어떤 이유로든 끝나지 않을 때
   * 먼저 끝난 결과까지 버려져 화면이 '불러오는 중'에 영영 갇힌다.
   */
  const commit = (profile: Profile | null) => {
    if (mine < applied) return;
    applied = mine;
    setProfile({ profile, loading: false });
  };

  return (async () => {
    try {
      commit(await fetchMyProfile(knownUid));
    } catch {
      // 정책상 못 읽는 경우도 "회원 아님"과 결과가 같다. 화면은 참여 코드를 요청하면 된다.
      commit(null);
    }
  })();
}

/**
 * 서버가 방금 돌려준 프로필을 그대로 반영한다.
 * 가입·코드 등록 직후에 쓴다 — 다시 조회하면 위의 경합을 또 만들 뿐이고,
 * 어차피 방금 받은 행이 가장 최신이다.
 */
export function applyProfile(profile: Profile): void {
  // 진행 중이던 조회가 이 값을 덮어쓰지 못하게 한다.
  applied = ++seq;
  setProfile({ profile, loading: false });
}

/**
 * 로그인·로그아웃되면 회원 여부가 바뀐다. 구독은 앱 수명 내내 하나면 충분하다.
 *
 * 콜백 안에서 supabase를 다시 부르면 안 된다 — supabase-js는 인증 락을 쥔 채 이 콜백을
 * 호출하므로 getSession() 같은 호출이 같은 락을 기다리며 교착한다(화면이 '불러오는 중'에서
 * 멈춘다). 그래서 ① 세션을 인자로 받아 쓰고 ② 다음 틱으로 미뤄 락이 풀린 뒤 실행한다.
 */
supabase.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user.id ?? null;
  // 이미 회원 정보를 알고 있으면 화면을 로딩으로 되돌리지 않는다 —
  // 토큰 자동 갱신 때마다 피드가 스피너로 깜빡이게 된다.
  if (!profileStore.profile) setProfile({ loading: true });
  setTimeout(() => {
    void reloadProfile(uid);
    // 하트는 "내가 눌렀는가"를 품고 있어 사람이 바뀌면 통째로 다시 읽어야 한다.
    resetGameLikes();
    void loadGameLikes();
  }, 0);
});

/**
 * 모듈 스토어를 구독한다.
 *
 * 수동 구독(useState + 강제 리렌더)으로는 안 된다 — 이 프로젝트는 React Compiler를 켜 두었고
 * (app.json의 experiments.reactCompiler), 컴파일러는 렌더 중에 읽는 모듈 변수를 '변하지 않는 값'으로
 * 보아 훅의 반환 객체를 메모이제이션한다. 그러면 스토어가 갱신돼도 화면은 첫 값에 머문다
 * (실제로 프로필을 다 받아 놓고도 '불러오는 중'에서 멈췄다).
 * useSyncExternalStore는 외부 스토어를 위한 표준 API라 컴파일러가 건드리지 않는다.
 */
export function useMyProfile() {
  const s = useSyncExternalStore(subscribeProfile, getProfileSnapshot, getProfileSnapshot);

  useEffect(() => {
    // 첫 조회는 한 번만. 여러 화면이 동시에 이 훅을 써도 요청이 겹치지 않는다.
    if (!started) {
      started = true;
      void reloadProfile();
    }
  }, []);

  return {
    profile: s.profile,
    loading: s.loading,
    isMember: s.profile !== null,
    reload: reloadProfile,
    /** 프로필 수정 후 캐시까지 갱신한다. 화면이 따로 새로고침할 필요가 없다. */
    save: async (input: {
      displayName?: string;
      bio?: string | null;
      avatarPath?: string | null;
      onboarded?: boolean;
    }) => {
      applyProfile(await updateProfile(input));
    },
  };
}

/**
 * 피드와 일정은 여러 화면이 함께 보는 목록이다(list-store.ts). 각자 따라가는 활동 시각이
 * 다르다 — 피드는 글·댓글, 일정은 일정이 새로 생긴 시각.
 */
const feedStore = createListStore<Post>(() => activityAt('feed'), () => fetchPosts());
const meetupStore = createListStore<Meetup>(() => activityAt('meetups'), () => fetchMeetups());

/** 좋아요를 누르는 중인 글. 빠르게 두 번 누르면 같은 요청이 겹쳐 서버에서 충돌한다. */
const liking = new Set<string>();

export function useFeed(enabled: boolean) {
  const s = useListStore(feedStore, useActivityAt('feed'), enabled);

  return {
    posts: enabled ? (s.data ?? []) : [],
    loading: enabled && s.data === null && !s.error,
    error: enabled ? s.error : null,
    pending: s.pending,
    reload: feedStore.reload,
    write: (input: PostInput) => feedStore.run(() => createPost(input)),
    edit: (id: string, body: string) => feedStore.run(() => updatePost(id, body)),
    remove: (id: string) => feedStore.run(() => deletePost(id)),
    /**
     * 좋아요는 누르는 즉시 바꿔 보여 준다 — 목록 전체를 다시 받는 동안 하트가 안 채워지면
     * "안 눌렸나" 싶어 한 번 더 누르게 된다. 실패하면 서버 상태로 되돌린다.
     */
    like: async (post: Post) => {
      if (liking.has(post.id)) return false;
      // 넘겨받은 글은 한 박자 늦은 렌더의 것일 수 있다. 지금 상태를 스토어에서 읽는다.
      const current = feedStore.snapshot().data?.find((p) => p.id === post.id) ?? post;
      const liked = current.likedByMe;
      const me = profileStore.profile;
      liking.add(post.id);
      feedStore.mutate((list) =>
        list.map((p) =>
          p.id !== post.id
            ? p
            : {
                ...p,
                likedByMe: !liked,
                likeCount: Math.max(0, p.likeCount + (liked ? -1 : 1)),
                likers: liked
                  ? p.likers.filter((l) => l.id !== me?.id)
                  : me
                    ? [...p.likers, me]
                    : p.likers,
              }
        )
      );
      try {
        await toggleLike(post.id, liked);
        return true;
      } catch (e) {
        // 되돌린 뒤에 문구를 적는다 — 다시 받기가 성공하면 오류를 지우기 때문이다.
        await feedStore.reload();
        feedStore.setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        liking.delete(post.id);
      }
    },
  };
}

/** 한 글의 댓글. 댓글창을 열 때만 받는다 — 피드 전체를 미리 받으면 낭비다. */
export function useComments(postId: string | null) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    if (!postId) return;
    try {
      setComments(await fetchComments(postId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [postId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  /**
   * 댓글을 달거나 지우면 글 카드의 '댓글 N개'도 함께 맞춘다. 피드 목록은 따로 받아 둔 것이라
   * 손대지 않으면 방금 단 댓글이 숫자에 안 잡힌다.
   */
  const run = async (fn: () => Promise<unknown>, delta: number) => {
    setPending(true);
    setError(null);
    try {
      await fn();
      if (postId) {
        feedStore.mutate((list) =>
          list.map((p) =>
            p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount + delta) } : p
          )
        );
      }
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setPending(false);
    }
  };

  return {
    comments,
    error,
    pending,
    add: (body: string) => run(() => addComment(postId as string, body), 1),
    remove: (id: string) => run(() => deleteComment(id), -1),
  };
}

export function useMeetups(enabled: boolean) {
  const s = useListStore(meetupStore, useActivityAt('meetups'), enabled);

  return {
    meetups: enabled ? (s.data ?? []) : [],
    loading: enabled && s.data === null && !s.error,
    error: enabled ? s.error : null,
    pending: s.pending,
    reload: meetupStore.reload,
    create: (input: MeetupInput) => meetupStore.run(() => createMeetup(input)),
    edit: (id: string, input: MeetupInput) => meetupStore.run(() => updateMeetup(id, input)),
    remove: (id: string) => meetupStore.run(() => deleteMeetup(id)),
    rsvp: (meetupId: string, status: RsvpStatus) =>
      meetupStore.run(() => setRsvp(meetupId, status)),
  };
}
