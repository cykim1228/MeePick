import { router } from 'expo-router';

import type { Member } from '@/features/plays/types';

import { useMyProfile } from './hooks';

/**
 * 사람을 누르면 그 사람의 프로필로 간다.
 *
 * 나 자신이면 '내 프로필' 탭으로 보낸다 — 남의 프로필 화면에서 내 얼굴을 보면
 * 편집 버튼이 없어 "왜 못 고치지"가 된다. 같은 사람은 같은 화면이어야 한다.
 */
export function useOpenProfile() {
  const { profile } = useMyProfile();
  return (profileId: string) => {
    if (!profileId) return;
    if (profileId === profile?.id) router.push('/profile');
    else router.push({ pathname: '/member', params: { id: profileId } });
  };
}

/**
 * 플레이 기록 속 사람(멤버)을 누르면 프로필로 간다.
 *
 * 기록·전당에는 계정이 없는 손님도 섞여 있다. 손님만 눌리지 않으면 "고장났나"가 되므로
 * 손님은 전적만 있는 프로필로 보낸다. 계정과 이어진 멤버는 회원 프로필과 같은 화면이다.
 */
export function useOpenMember() {
  const openProfile = useOpenProfile();
  return (member: Member) => {
    if (member.profileId) openProfile(member.profileId);
    else router.push({ pathname: '/member', params: { guest: member.id } });
  };
}

/** 글 하나를 연다 — 프로필 격자, 좋아요 목록 등 피드 밖에서 글로 들어가는 길. */
export function openPost(postId: string) {
  router.push({ pathname: '/post', params: { id: postId } });
}

/** 모임 하나 — 그날 한 게임·사진·참석자를 모아 본다. */
export function openMeetup(meetupId: string) {
  router.push({ pathname: '/meetup', params: { id: meetupId } });
}

/** 알림함. */
export function openNotifications() {
  router.push('/notifications');
}

/** 그 사람이 낀 판만 걸러 둔 기록 화면. */
export function openHistoryOf(memberId: string) {
  router.push({ pathname: '/history', params: { member: memberId } });
}
