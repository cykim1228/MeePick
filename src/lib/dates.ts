/**
 * 날짜는 항상 기기 로컬 기준 YYYY-MM-DD로 다룬다.
 *
 * timestamptz 문자열을 slice(0, 10)로 자르면 UTC 날짜가 나온다 —
 * KST 새벽(00~09시)에 끝난 판이 전날로 표시되는 오프바이원의 원인.
 * 서버의 current_date도 UTC라, 기록용 날짜는 클라이언트가 로컬로 만들어 보낸다.
 */
export function localToday(): string {
  return localDateOf(new Date());
}

export function localDateOf(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
