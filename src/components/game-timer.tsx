import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PRESETS = [
  { label: '30초', seconds: 30 },
  { label: '1분', seconds: 60 },
  { label: '2분', seconds: 120 },
  { label: '5분', seconds: 300 },
];

/** 종료 알림 — 웹은 짧은 비프 3회, 네이티브는 진동. 실패해도 화면 표시로 충분하다. */
function notifyDone() {
  try {
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 250, 120, 250]);
      return;
    }
    const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.3, 0.6].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.22);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.24);
    });
  } catch {
    // 무음이어도 "시간 종료!" 표시는 나간다
  }
}

/**
 * 턴 타이머 — 모래시계 대용. 게임중 시트에서 팝업으로 띄운다.
 * 닫아도 흐르던 시간은 유지된다(컴포넌트가 마운트 상태로 남으므로).
 */
export function GameTimer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useTheme();
  const [total, setTotal] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  // 남은 시간은 목표 시각에서 역산한다. interval 누적으로 세면 탭 백그라운드에서 밀린다.
  const endAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const endAt = endAtRef.current;
      if (endAt === null) return;
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        setDone(true);
        notifyDone();
      }
    }, 200);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    if (remaining === 0) return;
    endAtRef.current = Date.now() + remaining * 1000;
    setDone(false);
    setRunning(true);
  };
  const pause = () => {
    setRunning(false);
  };
  const reset = (seconds = total) => {
    setRunning(false);
    setDone(false);
    setTotal(seconds);
    setRemaining(seconds);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: c.backgroundElement, borderColor: done ? c.danger : c.accent },
          ]}
          onPress={() => undefined}>
          <Text style={[styles.caption, { color: c.textSecondary }]}>턴 타이머</Text>

          <Text style={[styles.time, { color: done ? c.danger : c.text }]}>
            {done ? '시간 종료!' : `${mm}:${ss}`}
          </Text>

          <View style={styles.chipRow}>
            {PRESETS.map((p) => (
              <Chip
                key={p.seconds}
                label={p.label}
                selected={total === p.seconds}
                onPress={() => reset(p.seconds)}
              />
            ))}
          </View>

          <View style={styles.chipRow}>
            <Pressable
              onPress={running ? pause : start}
              disabled={remaining === 0 && !done}
              accessibilityRole="button"
              style={[styles.mainButton, { backgroundColor: c.accent }]}>
              <Text style={[styles.mainButtonText, { color: c.onAccent }]}>
                {running ? '일시정지' : done ? '다시 시작' : '시작'}
              </Text>
            </Pressable>
            <Chip label="리셋" onPress={() => reset()} />
            <Chip label="닫기" onPress={onClose} />
          </View>

          {done && (
            <Text style={[styles.caption, { color: c.textSecondary }]}>
              다시 시작을 누르면 {total >= 60 ? `${Math.floor(total / 60)}분` : `${total}초`}부터
              다시 흐릅니다.
            </Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: Spacing.five,
  },
  card: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.six,
    borderRadius: Radius.lg,
    borderWidth: 2,
    minWidth: 320,
    maxWidth: 480,
  },
  caption: { ...Typography.caption, textAlign: 'center' },
  time: { fontSize: 64, lineHeight: 80, fontFamily: 'Jua_400Regular', fontVariant: ['tabular-nums'] },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  mainButton: {
    minHeight: TouchTarget.primary,
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    borderRadius: Radius.full,
  },
  mainButtonText: { ...Typography.body, fontWeight: '700' },
});
