import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useAuthed } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { signIn, signOut } from '@/lib/auth';

/**
 * 공용 계정 로그인 팝업 — 앱 바의 🔒에서 연다.
 * 조회는 로그인 없이 되므로 이 팝업은 기록·수정하는 사람(집 기기)만 쓴다.
 * CenterModal(상세용, 높이 92%)은 로그인 폼에 과해서 작은 카드를 따로 그린다.
 */
export function LoginModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useTheme();
  const authed = useAuthed();

  // 아이디는 로그인 성공 후에도 남겨 둔다 — 공용 계정 하나라 다음에 또 그 값이다.
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (pending || !id.trim() || !password) return;
    setPending(true);
    setError(null);
    try {
      await signIn(id, password);
      setPassword('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const leave = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기">
        {/* 카드 내부 탭이 배경 닫기로 전파되지 않게 막는다 */}
        <Pressable
          style={[styles.card, { backgroundColor: c.background, borderColor: c.border }]}
          onPress={() => undefined}>
          <Text style={[styles.title, { color: c.text }]}>
            {authed ? '로그인되어 있어요' : '로그인'}
          </Text>

          {authed ? (
            <>
              <Text style={[styles.sub, { color: c.textSecondary }]}>
                이 기기에서 기록·수정이 가능한 상태입니다.
              </Text>
              <Pressable
                onPress={() => void leave()}
                disabled={pending}
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: 1 }]}>
                <Text style={[styles.buttonText, { color: c.danger }]}>로그아웃</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.sub, { color: c.textSecondary }]}>
                구경은 로그인 없이 됩니다. 기록·수정하려면 공용 아이디로 로그인하세요.
              </Text>
              <TextInput
                value={id}
                onChangeText={setId}
                placeholder="아이디"
                placeholderTextColor={c.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => void submit()}
                placeholder="비밀번호"
                placeholderTextColor={c.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                style={[
                  styles.input,
                  { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
                ]}
              />
              <Pressable
                onPress={() => void submit()}
                disabled={pending || !id.trim() || !password}
                accessibilityRole="button"
                style={[
                  styles.button,
                  { backgroundColor: c.accent, opacity: pending || !id.trim() || !password ? 0.4 : 1 },
                ]}>
                <Text style={[styles.buttonText, { color: c.onAccent }]}>로그인</Text>
              </Pressable>
            </>
          )}

          {error && <Text style={[styles.error, { color: c.danger }]}>{error}</Text>}
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
    padding: Spacing.three,
  },
  card: {
    width: '94%',
    maxWidth: 420,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: { ...Typography.title },
  sub: { ...Typography.caption },
  input: {
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  button: {
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  buttonText: { ...Typography.body, fontWeight: '700' },
  error: { ...Typography.caption },
});
