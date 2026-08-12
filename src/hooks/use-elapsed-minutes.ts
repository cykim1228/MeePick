import { useEffect, useState } from 'react';

/**
 * 시작 시각부터 지난 분(分). 30초마다 갱신되어 게임중 타이머 표시에 쓴다.
 * 초 단위로 돌리면 매초 리렌더가 나는데, 분 표시에는 그럴 이유가 없다.
 */
export function useElapsedMinutes(sinceIso: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!sinceIso) return null;
  return Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 60_000));
}
