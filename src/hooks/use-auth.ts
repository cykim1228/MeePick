import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * 로그인 여부. null이면 아직 확인 전(저장된 세션을 읽는 첫 프레임).
 * 로그인/로그아웃은 onAuthStateChange 구독으로 즉시 반영된다.
 */
export function useAuthed(): boolean | null {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthed(!!data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setAuthed(!!session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return authed;
}
