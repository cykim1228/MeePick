import { supabase } from './supabase';

/**
 * 로그인은 공용 계정 하나이고, 화면에서는 아이디로 입력한다.
 * Supabase 계정은 이메일 형식이 필수라 아이디에 내부 도메인을 붙여 이메일로 만든다 —
 * 대시보드의 공용 계정도 같은 규칙(<아이디>@meepick.local)으로 만들어져 있어야 한다.
 * 메일을 보낼 일이 없으므로(자동 확인·복구 없음) 도메인이 실존할 필요는 없다.
 *
 * 개인 계정·가입 흐름을 두지 않는 이유: 신뢰 범위가 "집 + 친구"라 계정 관리가 부담만 되고,
 * 가입이 열려 있으면 anon 키로 누구나 authenticated가 되어 쓰기 잠금이 무의미해진다
 * (그래서 대시보드에서 가입을 꺼 둔다). — SUPABASE_SETUP.md 7-1
 */
const ID_DOMAIN = 'meepick.local';

/** '@'가 있으면 이메일로 보고 그대로, 없으면 아이디로 보고 내부 도메인을 붙인다. */
export function toAuthEmail(idOrEmail: string): string {
  const trimmed = idOrEmail.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed}@${ID_DOMAIN}`;
}

// 자물쇠 위치는 화면 크기에 따라 위/아래로 바뀐다. 방향을 지목하지 않는다.
export const authRequiredMessage = '기록·수정에는 로그인이 필요합니다 — 🔒 를 눌러 주세요.';

/**
 * 쓰기 쿼리 첫 줄에서 부른다. 최종 방어선은 RLS이고, 이 가드는 UX 장치다 —
 * RLS에 막힌 update/delete는 에러 없이 0행 매칭으로 끝나 "조용한 실패"가 되므로,
 * DB에 가기 전에 친절한 메시지로 끊어 준다.
 */
export async function requireAuth(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error(authRequiredMessage);
}

export async function signIn(idOrEmail: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: toAuthEmail(idOrEmail),
    password,
  });
  if (error) {
    if (/invalid login credentials/i.test(error.message))
      throw new Error('아이디 또는 비밀번호가 맞지 않습니다.');
    throw new Error(error.message);
  }
}

/**
 * 계정 만들기. 가입 자체는 인터넷에 열려 있지만, 이것만으로는 아무것도 못 본다 —
 * 초대 코드를 써서 profiles 행이 생겨야 회원이다(supabase/migrations/…_community.sql).
 * 그래서 가입을 열어도 모임 글은 안전하다.
 */
export async function signUp(idOrEmail: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: toAuthEmail(idOrEmail),
    password,
  });
  if (error) {
    if (/already registered/i.test(error.message)) throw new Error('이미 있는 아이디입니다.');
    if (/at least|password/i.test(error.message))
      throw new Error('비밀번호는 6자 이상이어야 합니다.');
    if (/signups not allowed/i.test(error.message))
      throw new Error('가입이 잠겨 있습니다. 관리자에게 문의하세요.');
    throw new Error(error.message);
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
