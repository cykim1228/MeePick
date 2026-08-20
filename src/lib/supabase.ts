import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * app.json의 web.output이 "static"이라 웹은 빌드 시 Node에서 한 번 렌더된다.
 * 그 단계에는 window가 없어 저장소(localStorage) 접근이 `window is not defined`로 죽는다.
 * 정적 산출물에 세션이 필요할 리 없으므로 그때만 세션 기능을 끈다.
 */
const isStaticRender = Platform.OS === 'web' && typeof window === 'undefined';

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
     * 조회는 공개지만 쓰기는 로그인(공용 계정)이 필요하다 — 강제는 RLS가 한다
     * (supabase/migrations/20260821090000_auth_write_lock.sql).
     * 세션을 저장해 기기당 로그인 1회로 유지한다. 네이티브는 기본 저장소가 없어
     * AsyncStorage를 명시한다.
     */
    persistSession: !isStaticRender,
    autoRefreshToken: !isStaticRender,
    // URL 해시 기반 세션 감지는 OAuth 리다이렉트용 — 비밀번호 로그인만 쓰므로 끈다.
    detectSessionInUrl: false,
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
  },
});
