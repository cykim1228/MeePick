import { requireAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import { toGame, toGameRow, type GameInput, type GameRow } from './mappers';
import type { Game } from './types';

/**
 * 소장 중인 게임 전부.
 *
 * 반환: Game[] (배열 그대로. 래핑 객체가 아니다)
 *
 * 소장 목록이 155종뿐이라 한 번에 가져와 필터·점수 계산을 클라이언트에서 한다.
 * 조건이 인원·시간·난이도·카테고리·테마로 복합적이고 가중치 점수까지 얽혀 있어,
 * SQL로 쪼개면 쿼리가 조건별로 늘어나고 점수 로직이 두 곳으로 갈라진다.
 * 목록이 수천 종으로 늘면 recommend_games RPC로 옮긴다.
 */
export async function fetchOwnedGames(): Promise<Game[]> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('owned', true)
    .order('title_ko', { ascending: true });

  // Supabase는 실패해도 throw하지 않고 { data: null, error }를 반환한다.
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toGame(row as GameRow));
}

/** 반환: Game[] — 소장하지 않은(위시리스트) 게임 */
export async function fetchWishlistGames(): Promise<Game[]> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('owned', false)
    .order('title_ko', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toGame(row as GameRow));
}

/** 반환: Game | null — 없으면 null */
export async function fetchGameById(id: string): Promise<Game | null> {
  const { data, error } = await supabase.from('games').select('*').eq('id', id).maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toGame(data as GameRow) : null;
}

/**
 * 게임 추가. 반환: Game (생성된 행)
 *
 * title_ko에 unique 제약이 있어 같은 제목을 두 번 넣으면 23505로 실패한다.
 * 노션 재임포트가 제목 기준 upsert이므로, 이 제약이 깨지면 임포트도 함께 깨진다.
 */
export async function createGame(input: GameInput): Promise<Game> {
  await requireAuth();
  const { data, error } = await supabase
    .from('games')
    .insert(toGameRow(input))
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`"${input.titleKo}"은(는) 이미 목록에 있습니다.`);
    throw new Error(error.message);
  }
  return toGame(data as GameRow);
}

/** 게임 수정. 반환: Game (갱신된 행) */
export async function updateGame(id: string, input: GameInput): Promise<Game> {
  await requireAuth();
  const { data, error } = await supabase
    .from('games')
    .update(toGameRow(input))
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`"${input.titleKo}"은(는) 이미 목록에 있습니다.`);
    throw new Error(error.message);
  }
  return toGame(data as GameRow);
}

/** 게임 삭제. */
export async function deleteGame(id: string): Promise<void> {
  await requireAuth();
  const { error } = await supabase.from('games').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// 빠른 기록은 plays/queries.ts의 logPlay(log_play RPC)로 옮겨졌다.
// 날짜만 갱신하던 mark_played RPC는 플레이 횟수(plays 집계)에 잡히지 않기 때문이다.
