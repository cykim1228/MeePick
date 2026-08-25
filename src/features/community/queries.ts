import { requireAuth, signIn, signUp } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import type { Comment, InviteCode, Meetup, Post, Profile, RsvpStatus } from './types';

/**
 * RLS가 막은 쓰기의 안내문.
 *
 * 권한이 모자란 것과 정책이 아직 안 깔린 것을 앱은 구별할 수 없다 — 둘 다 '0행'으로
 * 똑같이 보인다. 그래서 둘 다 짚어 준다. 모임장인데 이 문구를 본다면 정책 쪽이다.
 */
const RLS_BLOCKED = (what: string) =>
  `${what} 권한이 없습니다. 모임장 계정인데도 이 메시지가 보이면 관리자 정책 마이그레이션(supabase/migrations/20260826010000_admin_meetups.sql)이 아직 안 실행된 것입니다.`;

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  real_name: string | null;
  avatar_path: string | null;
  bio?: string | null;
  is_admin?: boolean;
};

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    realName: row.real_name ?? null,
    avatarPath: row.avatar_path,
    bio: row.bio ?? null,
    isAdmin: row.is_admin ?? false,
  };
}

/** 지워진 작성자 자리를 메운다. FK가 cascade라 실제로는 거의 안 쓰이지만, 피드가 깨지는 것보다 낫다. */
const UNKNOWN: Profile = {
  id: '',
  handle: '?',
  displayName: '(탈퇴한 회원)',
  realName: null,
  avatarPath: null,
  bio: null,
  isAdmin: false,
};

/* ── 회원 ─────────────────────────────────────────────────────────────── */

/**
 * 반환: Profile | null — 로그인했지만 초대 코드를 아직 안 쓴 사람은 null이다.
 * 이 null이 "가입은 했는데 회원은 아님" 상태의 근거이며, 화면은 초대 코드 입력을 띄운다.
 */
export async function fetchMyProfile(knownUid?: string | null): Promise<Profile | null> {
  // uid를 받은 경우 getSession을 부르지 않는다 — onAuthStateChange 콜백에서 호출될 때
  // supabase-js가 쥔 인증 락을 다시 기다려 교착에 빠지기 때문이다.
  let uid = knownUid ?? undefined;
  if (uid === undefined) {
    const { data: session } = await supabase.auth.getSession();
    uid = session.session?.user.id;
  }
  if (!uid) return null;

  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProfile(data as ProfileRow) : null;
}

export async function redeemInvite(
  code: string,
  displayName: string,
  realName?: string
): Promise<Profile> {
  await requireAuth();
  const { data, error } = await supabase.rpc('redeem_invite', {
    p_code: code,
    p_display_name: displayName,
    p_real_name: realName ?? null,
  });
  if (error) throw new Error(error.message);
  return toProfile(data as unknown as ProfileRow);
}

/**
 * 참여 코드가 맞는지만 묻는다. 계정을 만들기 **전에** 부른다 —
 * 계정을 먼저 만들고 코드가 틀리면 프로필 없는 유령 계정이 남고,
 * 같은 아이디로 다시 가입할 수도 없어 사용자가 막힌다.
 *
 * 검증은 서버(check_invite RPC)가 한다. 앱에 코드를 박아 두면 번들을 열어 보면 끝이라
 * 잠금이 아니게 된다.
 */
export async function checkInvite(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_invite', { p_code: code });
  if (error) {
    if (error.code === 'PGRST202')
      throw new Error(
        '가입 준비가 아직 안 됐습니다. supabase/migrations/20260825120000_join_code.sql 을 SQL Editor에서 실행하세요.'
      );
    throw new Error(error.message);
  }
  return data === true;
}

/**
 * 계정 생성 → 회원 등록. 코드는 화면에서 이미 통과한 값이지만 여기서 한 번 더 확인한다 —
 * 통과 뒤 가입까지 시간이 걸리는 동안 코드가 바뀌었을 수 있고,
 * 이 함수만 따로 불릴 여지도 남기지 않는다.
 */
export async function signUpAndJoin(input: {
  id: string;
  password: string;
  code: string;
  displayName: string;
  realName: string;
}): Promise<Profile> {
  if (!(await checkInvite(input.code))) throw new Error('참여 코드가 올바르지 않습니다.');

  await signUp(input.id, input.password);

  // 프로젝트 설정에 따라 가입 직후 세션이 없을 수 있다. 그때는 한 번 로그인해서 이어간다.
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) await signIn(input.id, input.password);

  // 만들어진 프로필을 그대로 돌려준다 — 호출자가 이 값을 캐시에 바로 넣으면
  // 로그인 이벤트가 유발한 조회와 경합할 일이 없다.
  return redeemInvite(input.code, input.displayName, input.realName);
}

export async function fetchMembers(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('display_name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toProfile(r as ProfileRow));
}

/** 초대 코드 발급. 반환: 만들어진 코드 문자열. */
export async function createInvite(): Promise<string> {
  await requireAuth();
  const { data: session } = await supabase.auth.getSession();
  // 헷갈리는 글자(0/O, 1/I)를 뺀 8자리. 말로 불러주기 쉬워야 한다.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(
    { length: 8 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join('');

  const { error } = await supabase
    .from('invite_codes')
    .insert({ code, created_by: session.session?.user.id });
  if (error) throw new Error(error.message);
  return code;
}

export async function fetchInvites(): Promise<InviteCode[]> {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as {
      code: string;
      used_by: string | null;
      used_at: string | null;
      is_reusable: boolean | null;
      created_at: string;
    };
    return {
      code: row.code,
      isReusable: row.is_reusable ?? false,
      usedBy: row.used_by,
      usedAt: row.used_at,
      createdAt: row.created_at,
    };
  });
}

/* ── 피드 ─────────────────────────────────────────────────────────────── */

/**
 * 반환: Post[] — 최신순. 좋아요·댓글 수는 별도 조회로 붙인다.
 *
 * 모임 규모(수십 명·수백 글)라 좋아요·댓글을 전부 받아 클라이언트에서 센다.
 * 글마다 count 쿼리를 날리면 왕복이 글 수만큼 늘어난다. 수천 글이 되면 뷰로 옮긴다.
 */
export async function fetchPosts(limit = 100): Promise<Post[]> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id ?? '';

  // 게임·일정은 별도로 받아 붙인다. 임베드 조인은 생성된 관계 타입에 의존해
  // 스키마가 바뀔 때마다 타입이 깨진다 — plays 쪽도 같은 이유로 이렇게 한다.
  const [posts, profiles, likes, comments, games, meetups] = await Promise.all([
    supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(limit),
    supabase.from('profiles').select('*'),
    supabase.from('post_likes').select('post_id,user_id'),
    supabase.from('post_comments').select('post_id'),
    supabase.from('games').select('id,title_ko,image_path').limit(1000),
    supabase.from('meetups').select('id,title'),
  ]);
  for (const r of [posts, profiles, likes, comments, games, meetups]) {
    if (r.error) throw new Error(r.error.message);
  }

  const gameById = new Map(
    ((games.data ?? []) as { id: string; title_ko: string; image_path: string | null }[]).map(
      (g) => [g.id, g]
    )
  );
  const meetupById = new Map(
    ((meetups.data ?? []) as { id: string; title: string }[]).map((m) => [m.id, m.title])
  );

  const byId = new Map(
    ((profiles.data ?? []) as ProfileRow[]).map((p) => [p.id, toProfile(p)])
  );

  const likers = new Map<string, Profile[]>();
  const mine = new Set<string>();
  for (const l of (likes.data ?? []) as { post_id: string; user_id: string }[]) {
    const list = likers.get(l.post_id) ?? [];
    const who = byId.get(l.user_id);
    if (who) list.push(who);
    likers.set(l.post_id, list);
    if (l.user_id === uid) mine.add(l.post_id);
  }

  const commentCount = new Map<string, number>();
  for (const cm of (comments.data ?? []) as { post_id: string }[]) {
    commentCount.set(cm.post_id, (commentCount.get(cm.post_id) ?? 0) + 1);
  }

  type Row = {
    id: string;
    author_id: string;
    body: string;
    image_paths: string[];
    game_id: string | null;
    meetup_id: string | null;
    created_at: string;
    updated_at: string;
  };
  return ((posts.data ?? []) as Row[]).map((row) => {
    const who = likers.get(row.id) ?? [];
    const game = row.game_id ? gameById.get(row.game_id) : undefined;
    return {
      id: row.id,
      author: byId.get(row.author_id) ?? UNKNOWN,
      body: row.body,
      imagePaths: row.image_paths ?? [],
      gameId: row.game_id,
      gameTitle: game?.title_ko ?? null,
      gameImagePath: game?.image_path ?? null,
      meetupId: row.meetup_id,
      meetupTitle: row.meetup_id ? (meetupById.get(row.meetup_id) ?? null) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
      likeCount: who.length,
      likedByMe: mine.has(row.id),
      likers: who,
      commentCount: commentCount.get(row.id) ?? 0,
    };
  });
}

/** 글 수정. 본문만 고친다 — 사진 교체는 지우고 새로 쓰는 편이 덜 헷갈린다. */
export async function updatePost(id: string, body: string): Promise<void> {
  await requireAuth();
  const { error } = await supabase
    .from('posts')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export type PostInput = {
  body: string;
  imagePaths: string[];
  gameId?: string | null;
  meetupId?: string | null;
};

export async function createPost(input: PostInput): Promise<void> {
  await requireAuth();
  const { data: session } = await supabase.auth.getSession();
  const { error } = await supabase.from('posts').insert({
    author_id: session.session?.user.id,
    body: input.body.trim(),
    image_paths: input.imagePaths,
    game_id: input.gameId ?? null,
    meetup_id: input.meetupId ?? null,
  });
  if (error) throw new Error(error.message);
}

/** 프로필 수정 — 닉네임·한 줄 소개·아바타. 정책상 본인 것만 고쳐진다. */
export async function updateProfile(input: {
  displayName?: string;
  bio?: string | null;
  avatarPath?: string | null;
}): Promise<Profile> {
  await requireAuth();
  const { data: session } = await supabase.auth.getSession();
  const patch: Partial<ProfileRow> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName.trim();
  if (input.bio !== undefined) patch.bio = input.bio?.trim() || null;
  if (input.avatarPath !== undefined) patch.avatar_path = input.avatarPath;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', session.session?.user.id as string)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return toProfile(data as ProfileRow);
}

export async function deletePost(id: string): Promise<void> {
  await requireAuth();
  const { data, error } = await supabase.from('posts').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(RLS_BLOCKED('글을 지울'));
}

/** 좋아요 토글. liked는 "지금 눌러져 있는지"이며, 반대 동작을 수행한다. */
export async function toggleLike(postId: string, liked: boolean): Promise<void> {
  await requireAuth();
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id as string;

  if (liked) {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', uid);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: uid });
    if (error) throw new Error(error.message);
  }
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const [comments, profiles] = await Promise.all([
    supabase.from('post_comments').select('*').eq('post_id', postId).order('created_at'),
    supabase.from('profiles').select('*'),
  ]);
  if (comments.error) throw new Error(comments.error.message);
  if (profiles.error) throw new Error(profiles.error.message);

  const byId = new Map(((profiles.data ?? []) as ProfileRow[]).map((p) => [p.id, toProfile(p)]));
  type Row = { id: string; post_id: string; author_id: string; body: string; created_at: string };
  return ((comments.data ?? []) as Row[]).map((r) => ({
    id: r.id,
    postId: r.post_id,
    author: byId.get(r.author_id) ?? UNKNOWN,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addComment(postId: string, body: string): Promise<void> {
  await requireAuth();
  const { data: session } = await supabase.auth.getSession();
  const { error } = await supabase.from('post_comments').insert({
    post_id: postId,
    author_id: session.session?.user.id,
    body: body.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function deleteComment(id: string): Promise<void> {
  await requireAuth();
  const { data, error } = await supabase.from('post_comments').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(RLS_BLOCKED('댓글을 지울'));
}

/* ── 모임 일정 ────────────────────────────────────────────────────────── */

/** 반환: Meetup[] — 다가오는 일정이 먼저, 지난 일정이 뒤. */
export async function fetchMeetups(): Promise<Meetup[]> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id ?? '';

  const [meetups, rsvps, profiles] = await Promise.all([
    supabase.from('meetups').select('*').order('starts_at', { ascending: false }),
    supabase.from('meetup_rsvps').select('*'),
    supabase.from('profiles').select('*'),
  ]);
  for (const r of [meetups, rsvps, profiles]) {
    if (r.error) throw new Error(r.error.message);
  }

  const byId = new Map(((profiles.data ?? []) as ProfileRow[]).map((p) => [p.id, toProfile(p)]));
  const byMeetup = new Map<string, { profile: Profile; status: RsvpStatus }[]>();
  const mine = new Map<string, RsvpStatus>();
  for (const r of (rsvps.data ?? []) as {
    meetup_id: string;
    user_id: string;
    status: RsvpStatus;
  }[]) {
    const list = byMeetup.get(r.meetup_id) ?? [];
    list.push({ profile: byId.get(r.user_id) ?? UNKNOWN, status: r.status });
    byMeetup.set(r.meetup_id, list);
    if (r.user_id === uid) mine.set(r.meetup_id, r.status);
  }

  type Row = {
    id: string;
    title: string;
    starts_at: string;
    place: string | null;
    memo: string | null;
    capacity: number | null;
    created_by: string;
  };
  // 목록 전체가 같은 기준 시각을 쓴다. 항목마다 now를 다시 읽으면 경계에 걸린 모임이
  // 정렬과 표시에서 서로 다르게 판정될 수 있다.
  const now = Date.now();
  const all = ((meetups.data ?? []) as Row[]).map((row) => ({
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    place: row.place,
    memo: row.memo,
    capacity: row.capacity ?? null,
    createdBy: row.created_by,
    isPast: new Date(row.starts_at).getTime() < now,
    rsvps: byMeetup.get(row.id) ?? [],
    myStatus: mine.get(row.id) ?? null,
  }));

  // 다가오는 일정은 가까운 순, 지난 일정은 최근 순. 오늘 할 모임이 맨 위여야 한다.
  const upcoming = all.filter((m) => !m.isPast).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return [...upcoming, ...all.filter((m) => m.isPast)];
}

export type MeetupInput = {
  title: string;
  startsAt: string;
  place: string | null;
  memo: string | null;
  capacity: number | null;
};

export async function createMeetup(input: MeetupInput): Promise<void> {
  await requireAuth();
  const { data: session } = await supabase.auth.getSession();
  const { error } = await supabase.from('meetups').insert({
    title: input.title.trim(),
    starts_at: input.startsAt,
    place: input.place?.trim() || null,
    memo: input.memo?.trim() || null,
    capacity: input.capacity,
    created_by: session.session?.user.id,
  });
  if (error) throw new Error(error.message);
}

/** 일정 수정. 만든 사람만 가능하다(정책이 강제). */
export async function updateMeetup(id: string, input: MeetupInput): Promise<void> {
  await requireAuth();
  const { data, error } = await supabase
    .from('meetups')
    .update({
      title: input.title.trim(),
      starts_at: input.startsAt,
      place: input.place?.trim() || null,
      memo: input.memo?.trim() || null,
      capacity: input.capacity,
    })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(RLS_BLOCKED('일정을 고칠'));
}

/**
 * 일정 삭제.
 *
 * `.select()`를 붙여 **실제로 지워진 행**을 돌려받는다. RLS에 막힌 delete는 에러 없이
 * 0행으로 끝나기 때문이다 — 그대로 두면 화면은 아무 말 없이 목록을 다시 불러오고,
 * 지워지지 않은 일정이 그 자리에 그대로 있다. 쓰는 사람은 원인을 짐작할 수밖에 없다.
 */
export async function deleteMeetup(id: string): Promise<void> {
  await requireAuth();
  const { data, error } = await supabase.from('meetups').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(RLS_BLOCKED('일정을 지울'));
}

/** 참석 응답. 이미 응답했으면 갱신된다(기본키가 (meetup_id, user_id)). */
export async function setRsvp(meetupId: string, status: RsvpStatus): Promise<void> {
  await requireAuth();
  const { data: session } = await supabase.auth.getSession();
  const { error } = await supabase
    .from('meetup_rsvps')
    .upsert(
      { meetup_id: meetupId, user_id: session.session?.user.id, status },
      { onConflict: 'meetup_id,user_id' }
    );
  if (error) throw new Error(error.message);
}

/* ── 관리 (모임장 전용) ───────────────────────────────────────────────── */

/**
 * 회원 내보내기.
 *
 * 계정(auth.users)이 아니라 프로필을 지운다 — 그 사람이 쓴 글·댓글은 함께 사라지지만
 * 플레이 기록의 멤버 행은 남는다(연결만 끊김). 지난 게임의 승패는 사람이 나가도
 * 남아 있어야 통계가 성립하기 때문이다.
 * 계정은 살아 있으므로 참여 코드를 다시 넣으면 돌아올 수 있다.
 */
export async function removeMemberProfile(id: string): Promise<void> {
  await requireAuth();
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** 관리자 권한 넘기기·나누기. 정책상 관리자만 부를 수 있다. */
export async function setAdmin(id: string, isAdmin: boolean): Promise<void> {
  await requireAuth();
  const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', id);
  if (error) throw new Error(error.message);
}
