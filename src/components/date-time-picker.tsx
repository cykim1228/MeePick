import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' — 로컬 기준. toISOString은 UTC라 새벽에 하루 어긋난다. */
export function toDateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'HH:MM' */
export function toTimeValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** '8월 30일 (토)' — 버튼에 보여줄, 사람이 읽는 형식 */
function labelOfDate(value: string): string {
  const d = parseDate(value);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}

/** '오후 7:00' */
function labelOfTime(value: string): string {
  const [h, m] = value.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${pad(m)}`;
}

/**
 * 날짜·시간 고르기 — 타이핑 대신 달력과 목록에서 고른다.
 *
 * 텍스트로 받으면 '2026-8-3', '19시' 같은 변형이 끝없이 들어오고 그때마다 형식 오류를
 * 되돌려 주는 대화가 생긴다. 고르게 하면 잘못된 값이 애초에 만들어지지 않는다 —
 * 날짜 칸에 시간을 적는 일도 구조적으로 막힌다.
 *
 * 플랫폼 기본 피커를 쓰지 않는 이유: 웹·안드로이드·iOS가 서로 다른 모양이라
 * 이 앱의 팔레트·글꼴과 따로 논다.
 */
export function DateTimeField({
  mode,
  value,
  onChange,
  label,
}: {
  mode: 'date' | 'time';
  /** date는 'YYYY-MM-DD', time은 'HH:MM' */
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const c = useTheme();
  const t = useType();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label} 고르기`}
        style={[styles.field, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <Icon name={mode === 'date' ? 'calendar' : 'more'} size={18} color={c.textSecondary} />
        <Text style={[t.body, { color: c.text, flex: 1 }]} numberOfLines={1}>
          {mode === 'date' ? labelOfDate(value) : labelOfTime(value)}
        </Text>
        <Icon name="chevronRight" size={16} color={c.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="닫기">
          <Pressable
            style={[styles.sheet, { backgroundColor: c.background, borderColor: c.border }]}
            onPress={() => undefined}>
            <View style={styles.sheetHead}>
              <Text style={[t.subtitle, { color: c.text, flex: 1 }]}>{label}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                style={styles.iconButton}>
                <Icon name="close" size={20} color={c.textSecondary} />
              </Pressable>
            </View>

            {mode === 'date' ? (
              <Calendar
                value={value}
                onPick={(v) => {
                  onChange(v);
                  setOpen(false);
                }}
              />
            ) : (
              <TimeList
                value={value}
                onPick={(v) => {
                  onChange(v);
                  setOpen(false);
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Calendar({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const c = useTheme();
  const t = useType();
  const selected = parseDate(value);
  const [cursor, setCursor] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 앞쪽 빈칸 + 날짜. 칸 폭이 1/7이라 flexWrap이 알아서 주 단위로 줄을 바꾼다.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const move = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <View style={styles.calendar}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => move(-1)}
          accessibilityRole="button"
          accessibilityLabel="지난달"
          style={styles.iconButton}>
          <View style={styles.flip}>
            <Icon name="chevronRight" size={18} color={c.text} />
          </View>
        </Pressable>
        <Text style={[t.subtitle, styles.monthLabel, { color: c.text }]}>
          {year}년 {month + 1}월
        </Text>
        <Pressable
          onPress={() => move(1)}
          accessibilityRole="button"
          accessibilityLabel="다음달"
          style={styles.iconButton}>
          <Icon name="chevronRight" size={18} color={c.text} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEK.map((w, i) => (
          <Text
            key={w}
            style={[
              t.caption,
              styles.cell,
              styles.weekLabel,
              { color: i === 0 ? c.danger : c.textSecondary },
            ]}>
            {w}
          </Text>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <View key={`blank-${i}`} style={styles.cell} />;
          const v = `${year}-${pad(month + 1)}-${pad(day)}`;
          const on = v === value;
          const weekday = (firstWeekday + day - 1) % 7;
          return (
            <Pressable
              key={v}
              onPress={() => onPick(v)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.cell, styles.dayCell, on && { backgroundColor: c.accent }]}>
              <Text style={[t.body, { color: on ? c.onAccent : weekday === 0 ? c.danger : c.text }]}>
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => onPick(toDateValue(new Date()))}
        accessibilityRole="button"
        style={[styles.today, { borderColor: c.border }]}>
        <Text style={[t.caption, styles.todayText, { color: c.accent }]}>오늘로</Text>
      </Pressable>
    </View>
  );
}

/** 30분 간격 — 모임 시각은 이 단위면 충분하고, 48칸이라 한 화면에서 훑을 수 있다. */
function TimeList({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const c = useTheme();
  const t = useType();

  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) slots.push(`${pad(h)}:${pad(m)}`);
  }

  return (
    <ScrollView style={styles.timeList}>
      <View style={styles.timeGrid}>
        {slots.map((v) => {
          const on = v === value;
          return (
            <Pressable
              key={v}
              onPress={() => onPick(v)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.timeCell,
                {
                  borderColor: on ? c.accent : c.border,
                  backgroundColor: on ? c.accent : 'transparent',
                },
              ]}>
              <Text
                style={[
                  t.caption,
                  { color: on ? c.onAccent : c.text, fontWeight: on ? '700' : '400' },
                ]}>
                {labelOfTime(v)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: Spacing.three,
  },
  sheet: {
    width: '96%',
    maxWidth: 380,
    maxHeight: '85%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  iconButton: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 오른쪽 화살표를 뒤집어 왼쪽 화살표로 쓴다 — 아이콘을 하나 더 그리지 않아도 된다.
  flip: { transform: [{ scaleX: -1 }] },
  calendar: { gap: Spacing.two },
  monthRow: { flexDirection: 'row', alignItems: 'center' },
  monthLabel: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', height: 42, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { height: 28, lineHeight: 28, textAlign: 'center' },
  dayCell: { borderRadius: Radius.full },
  today: {
    alignSelf: 'center',
    minHeight: TouchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  todayText: { fontWeight: '700' },
  timeList: { maxHeight: 360 },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  timeCell: {
    width: '31.5%',
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
  },
});
