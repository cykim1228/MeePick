import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { applyProfile } from '@/features/community/hooks';
import { redeemInvite } from '@/features/community/queries';
import { useAuthed } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * 모임 화면(피드·일정) 앞의 문.
 *
 * 상태가 셋이다 — 로그인 안 함 / 로그인은 했지만 초대 코드를 안 씀 / 회원.
 * 가운데 상태가 이 앱의 가입 모델이다: 가입은 인터넷에 열려 있지만, 초대 코드를 써서
 * 프로필이 생겨야 회원이고, 그 전에는 모임 글이 하나도 보이지 않는다(RLS가 강제).
 */
export function MemberGate() {
  const c = useTheme();
  const authed = useAuthed();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authed === null) return null; // 세션 확인 중 — 깜빡임 방지

  if (!authed) {
    return (
      <View style={styles.center}>
        <Text style={[styles.title, { color: c.text }]}>모임 회원만 볼 수 있어요</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          메뉴의 🔒 를 눌러 로그인하세요. 게임 목록은 로그인 없이도 볼 수 있습니다.
        </Text>
      </View>
    );
  }

  const submit = async () => {
    if (!code.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      applyProfile(await redeemInvite(code, name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: c.text }]}>참여 코드를 입력하세요</Text>
      <Text style={[styles.body, { color: c.textSecondary }]}>
        모임에서 받은 코드를 넣으면 피드와 일정이 열립니다.
      </Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        onSubmitEditing={() => void submit()}
        placeholder="참여 코드"
        placeholderTextColor={c.textSecondary}
        autoCapitalize="characters"
        autoCorrect={false}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
        ]}
      />
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={() => void submit()}
        placeholder="모임에서 부를 이름 (비우면 아이디)"
        placeholderTextColor={c.textSecondary}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border },
        ]}
      />
      <Pressable
        onPress={() => void submit()}
        disabled={pending || !code.trim()}
        accessibilityRole="button"
        style={[
          styles.button,
          { backgroundColor: c.accent, opacity: pending || !code.trim() ? 0.4 : 1 },
        ]}>
        <Text style={[styles.buttonText, { color: c.onAccent }]}>
          {pending ? '확인 중…' : '모임 참여하기'}
        </Text>
      </Pressable>

      {error && <Text style={[styles.body, { color: c.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  title: { ...Typography.title, textAlign: 'center' },
  body: { ...Typography.body, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    minHeight: TouchTarget.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    ...Typography.body,
  },
  button: {
    alignSelf: 'stretch',
    minHeight: TouchTarget.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  buttonText: { ...Typography.body, fontWeight: '700' },
});
