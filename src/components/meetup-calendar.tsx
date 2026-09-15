import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import type { Meetup } from '@/features/community/types';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';
import {
  formatDayLabel,
  localDateOf,
  localToday,
  monthOf,
  monthWeeks,
  shiftMonth,
} from '@/lib/dates';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 일정 달력 — 한 달을 한눈에.
 *
 * 목록은 "다음 모임이 뭐지"에는 좋지만 "이번 달에 몇 번 모이지, 그 주말은 비었나"는 안 보인다.
 * 날짜를 누르면 고르기만 한다 — 그날 일정은 달력 아래에 따로 보여 준다. 칸 안에 전부 넣으면
 * 폰에서 글자가 읽히지 않는다.
 *
 * 폰은 칸이 좁아 점으로, 태블릿·데스크탑은 제목을 짧게 적는다. 다가오는 모임은 강조색,
 * 지난 모임은 흐린 색이다.
 */
export function MeetupCalendar({
  meetups,
  month,
  selected,
  onMonthChange,
  onSelect,
}: {
  meetups: Meetup[];
  /** 'YYYY-MM' */
  month: string;
  /** 'YYYY-MM-DD' */
  selected: string;
  onMonthChange: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const c = useTheme();
  const t = useType();
  const wide = useBreakpoint() !== 'compact';
  const today = localToday();
  const weeks = useMemo(() => monthWeeks(month), [month]);

  // 날짜별 일정. 시각은 기기 로컬 날짜로 자른다 — UTC로 자르면 밤 모임이 다음 날로 간다.
  const byDate = useMemo(() => {
    const map = new Map<string, Meetup[]>();
    for (const m of meetups) {
      const day = localDateOf(m.startsAt);
      map.set(day, [...(map.get(day) ?? []), m]);
    }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [meetups]);

  // 일요일은 붉게, 토요일은 푸르게 — 종이 달력에서 익숙한 구분이라 주말이 바로 보인다.
  const dayColor = (weekday: number) =>
    weekday === 0 ? c.danger : weekday === 6 ? c.badgeRecommended : c.text;

  const [year, monthNum] = month.split('-').map(Number);
  const showToday = month !== monthOf(today) || selected !== today;

  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={styles.head}>
        <Pressable
          onPress={() => onMonthChange(shiftMonth(month, -1))}
          accessibilityRole="button"
          accessibilityLabel="이전 달"
          style={styles.navButton}>
          <View style={styles.flip}>
            <Icon name="chevronRight" size={18} color={c.text} />
          </View>
        </Pressable>
        <Text style={[t.subtitle, { color: c.text }]}>
          {year}년 {monthNum}월
        </Text>
        <Pressable
          onPress={() => onMonthChange(shiftMonth(month, 1))}
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          style={styles.navButton}>
          <Icon name="chevronRight" size={18} color={c.text} />
        </Pressable>
        <View style={styles.spacer} />
        {showToday && (
          <Pressable
            onPress={() => {
              onMonthChange(monthOf(today));
              onSelect(today);
            }}
            accessibilityRole="button"
            style={[styles.todayButton, { borderColor: c.border }]}>
            <Text style={[t.caption, styles.bold, { color: c.text }]}>오늘</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[t.caption, styles.weekday, { color: dayColor(i) }]}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week) => (
        <View
          key={week[0]}
          style={[
            styles.week,
            wide && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
          ]}>
          {week.map((date, i) => {
            const items = byDate.get(date) ?? [];
            const inMonth = monthOf(date) === month;
            const isSelected = date === selected;
            const isToday = date === today;
            return (
              <Pressable
                key={date}
                onPress={() => onSelect(date)}
                accessibilityRole="button"
                accessibilityLabel={`${formatDayLabel(date)}${items.length ? `, 일정 ${items.length}개` : ''}`}
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.cell,
                  wide ? styles.cellWide : styles.cellCompact,
                  !inMonth && styles.outside,
                  pressed && styles.pressed,
                ]}>
                <View
                  style={[
                    styles.num,
                    isSelected
                      ? { backgroundColor: c.accent }
                      : isToday
                        ? { borderWidth: 1.5, borderColor: c.accent }
                        : null,
                  ]}>
                  <Text
                    style={[
                      t.caption,
                      styles.numText,
                      { color: isSelected ? c.onAccent : dayColor(i) },
                    ]}>
                    {Number(date.slice(8))}
                  </Text>
                </View>

                {wide ? (
                  <View style={styles.pills}>
                    {items.slice(0, 2).map((m) => (
                      <View
                        key={m.id}
                        style={[
                          styles.pill,
                          { backgroundColor: m.isPast ? c.backgroundSelected : c.accent },
                        ]}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.pillText,
                            { color: m.isPast ? c.textSecondary : c.onAccent },
                          ]}>
                          {m.title}
                        </Text>
                      </View>
                    ))}
                    {items.length > 2 && (
                      <Text style={[styles.pillText, { color: c.textSecondary }]}>
                        +{items.length - 2}
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.dots}>
                    {items.slice(0, 3).map((m) => (
                      <View
                        key={m.id}
                        style={[
                          styles.dot,
                          { backgroundColor: m.isPast ? c.textSecondary : c.accent },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  navButton: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flip: { transform: [{ scaleX: -1 }] },
  spacer: { flex: 1 },
  todayButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  bold: { fontWeight: '700' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: Spacing.one, fontWeight: '700' },
  // 칸은 폭을 숫자로 주지 않고 나눠 갖는다 — 폭을 계산해 넣으면 화면 폭에 따라 오른쪽이 빈다.
  cell: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: Spacing.one },
  cellCompact: { minHeight: 48 },
  cellWide: { minHeight: 84, alignItems: 'stretch', paddingHorizontal: 2 },
  outside: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
  num: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  numText: { fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: Radius.full },
  pills: { gap: 2, marginTop: 2 },
  pill: { borderRadius: Radius.sm, paddingHorizontal: Spacing.one, paddingVertical: 1 },
  pillText: { ...Typography.caption, fontWeight: '600' },
});
