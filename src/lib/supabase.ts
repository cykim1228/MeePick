import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 환경 변수가 없으면 supabase-js가 생성 시점에 던지지 않고 요청 시점에 모호하게 실패한다.
 * 어떤 값이 비었는지 화면에서 알 수 있도록 여기서 미리 판정한다.
 */
/** 공개 버킷의 이미지 URL을 만들 때 필요하다. */
export const supabaseUrl = url ?? '';

export const supabaseConfigError =
  !url || !anonKey
    ? '.env에 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY를 설정한 뒤 개발 서버를 재시작하세요. (SUPABASE_SETUP.md 참고)'
    : null;

export const supabase = createClient<Database>(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: {
    /**
     * 이 앱은 로그인이 없다. anon 키로 공개 읽기만 하고 쓰기는 mark_played RPC로만 한다.
     * 유지할 세션이 없으므로 저장소를 아예 쓰지 않는다.
     *
     * 켜두면 안 되는 이유가 하나 더 있다 — app.json의 web.output이 "static"이라
     * 웹은 Node에서 서버 렌더링되는데, supabase-js가 초기화 중 세션 복구를 시도하며
     * 저장소(웹에서는 window.localStorage)에 접근해 `window is not defined`로 죽는다.
     */
    persistSession: false,
    autoRefreshToken: false,
    // URL 해시 기반 세션 감지는 웹 전용이며, 여기서는 쓰지 않는다.
    detectSessionInUrl: false,
  },
});
