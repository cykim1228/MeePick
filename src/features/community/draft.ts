import { useSyncExternalStore } from 'react';

/**
 * 글쓰기 초안 전달함.
 *
 * 모임을 마무리하면 "오늘 3판 — 아줄, 스플렌더…" 같은 초안을 만들어 피드로 보낸다.
 * 그 초안을 화면 사이로 나르는 통로다.
 *
 * 라우터 파라미터를 쓰지 않는 이유: 초안에는 줄바꿈과 이모지가 들어가고, 이미 피드에
 * 있는 상태에서 다시 보낼 수도 있다(주소가 그대로라 파라미터 변화를 못 잡는다).
 * 한 칸짜리 전달함이 더 정직하다 — 넣고, 받으면 비운다.
 */
export type PostDraft = {
  body: string;
  /** 오늘 열린 일정이 있으면 글을 거기 붙인다. 없으면 null */
  meetupId: string | null;
  meetupTitle: string | null;
};

let draft: PostDraft | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => draft;

export function setPostDraft(next: PostDraft) {
  draft = next;
  notify();
}

/** 초안을 집어 들면 통로를 비운다 — 화면을 오갈 때마다 같은 글이 다시 들어차지 않게. */
export function clearPostDraft() {
  if (draft === null) return;
  draft = null;
  notify();
}

export function usePostDraft(): PostDraft | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
