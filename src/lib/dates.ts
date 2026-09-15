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

/** 피드용 상대 시간 — '방금', '3시간 전'. 일주일이 넘으면 날짜를 그대로 보여준다. */
export function timeAgo(value: string, now = new Date()): string {
  const then = new Date(value).getTime();
  const min = Math.floor((now.getTime() - then) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return localDateOf(value);
}

/**
 * 일정용 남은 날짜 — '오늘', 'D-3', '지난 모임'.
 * 시간 차가 아니라 **날짜 차**로 센다 — 오늘 밤 모임이 'D-0'이 아니라 '오늘'이어야 한다.
 */
export function dDay(value: string, now = new Date()): string {
  const start = new Date(value);
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((a - b) / 86400000);
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  if (days > 1) return `D-${days}`;
  return '지난 모임';
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 일정용 — '8월 30일 (토) 오후 7:00' */
export function formatMeetupTime(value: string): string {
  const d = new Date(value);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]}) ${formatClock(value)}`;
}

/** 시각만 — '오후 7:00'. 달력에서 날짜를 이미 고른 뒤에 쓴다. */
export function formatClock(value: string): string {
  const d = new Date(value);
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → '9월 20일 (토)' */
export function formatDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(y, m - 1, d).getDay()]})`;
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** 달 옮기기 — ('2026-12', 1) → '2027-01' */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 달력 칸 — 일요일에 시작하는 주 단위 날짜들.
 * 그 달의 마지막 날이 든 주까지만 만든다(5주 또는 6주). 늘 6주로 그리면 빈 줄이 한 줄 남는 달이 생긴다.
 */
export function monthWeeks(month: string): string[][] {
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const weeks: string[][] = [];
  for (let i = 0; i < Math.ceil((lead + days) / 7) * 7; i += 1) {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(localDateOf(new Date(y, m - 1, 1 - lead + i)));
  }
  return weeks;
}
