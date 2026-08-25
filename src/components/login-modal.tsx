import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Radius, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { applyProfile, useMyProfile } from '@/features/community/hooks';
import { checkInvite, signUpAndJoin } from '@/features/community/queries';
import { useAuthed } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { signIn, signOut } from '@/lib/auth';

/**
 * 계정 팝업 — 앱 바의 자물쇠에서 연다.
 *
 * 로그인은 아이디·비밀번호 둘만.
 *
 * 가입은 2단계다 — 참여 코드를 먼저 통과해야 가입 양식이 열린다.
 * 코드와 개인정보를 한 화면에 늘어놓으면 모임 사람이 아닌 방문자도 양식을 다 채운 뒤에야
 * 거절당한다. 문을 먼저 확인하는 편이 서로에게 낫다.
 */
export function LoginModal({
  visible,
  onClose,
  initialCode,
}: {
  visible: boolean;
  onClose: () => void;
  /** 초대 링크로 들어온 경우의 참여 코드. 있으면 코드 확인 단계로 열린다. */
  initialCode?: string;
}) {
  const c = useTheme();
  const authed = useAuthed();
  const { profile, isMember } = useMyProfile();

  // in: 로그인 / code: 참여 코드 확인 / up: 가입 양식(코드 통과 후)
  const [mode, setMode] = useState<'in' | 'code' | 'up'>(initialCode ? 'code' : 'in');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [realName, setRealName] = useState('');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState(initialCode ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPassword('');
    setRealName('');
    setNickname('');
    setCode('');
  };

  const run = async (fn: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const canSignIn = !!id.trim() && !!password;
  // Supabase가 6자 미만을 거절한다. 눌러 본 뒤 실패하는 대신 버튼을 잠가 미리 알린다.
  const canSignUp = !!id.trim() && password.length >= 6 && !!realName.trim() && !!nickname.trim();

  /** 코드 확인 단계 — 통과해야 가입 양식이 열린다. */
  const verifyCode = () =>
    run(async () => {
      if (!code.trim()) return;
      if (!(await checkInvite(code.trim()))) throw new Error('참여 코드가 올바르지 않습니다.');
      setMode('up');
    });

  const submit = () =>
    run(async () => {
      if (mode === 'up') {
        if (!canSignUp) return;
        const created = await signUpAndJoin({
          id: id.trim(),
          password,
          code: code.trim(),
          displayName: nickname.trim(),
          realName: realName.trim(),
        });
        // 방금 만들어진 프로필을 바로 반영한다. 다시 조회하면 로그인 이벤트가 시작한
        // 조회(그 시점엔 프로필이 없었다)와 경합해 '회원 아님'으로 굳을 수 있다.
        applyProfile(created);
      } else {
        if (!canSignIn) return;
        await signIn(id, password);
      }
      reset();
      setMode('in');
      onClose();
    });

  const field = { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기">
        {/* 카드 내부 탭이 배경 닫기로 전파되지 않게 막는다 */}
        <Pressable
          style={[styles.card, { backgroundColor: c.background, borderColor: c.border }]}
          onPress={() => undefined}>
          <ScrollView contentContainerStyle={styles.content}>
            {authed ? (
              <>
                <Text style={[styles.title, { color: c.text }]}>
                  {profile ? `${profile.displayName} 님` : '로그인됨'}
                </Text>
                <Text style={[styles.sub, { color: c.textSecondary }]}>
                  {isMember
                    ? '모임 회원입니다. 피드·일정과 게임 기록을 남길 수 있어요.'
                    : '아직 모임 회원이 아닙니다. 피드 탭에서 참여 코드를 입력하세요.'}
                </Text>
                <Text style={[styles.sub, { color: c.textSecondary }]}>
                  {profile?.handle ? `아이디 ${profile.handle}` : ''}
                </Text>
                <Pressable
                  onPress={() => void run(signOut)}
                  disabled={pending}
                  accessibilityRole="button"
                  style={[
                    styles.button,
                    { backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: 1 },
                  ]}>
                  <Text style={[styles.buttonText, { color: c.danger }]}>로그아웃</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.title, { color: c.text }]}>
                  {mode === 'in' ? '로그인' : mode === 'code' ? '모임 참여하기' : '가입 정보'}
                </Text>
                <Text style={[styles.sub, { color: c.textSecondary }]}>
                  {mode === 'code'
                    ? '모임에서 받은 참여 코드를 입력하세요.'
                    : mode === 'up'
                      ? '코드가 확인됐어요. 사용할 정보를 입력하세요.'
                      : '게임 목록은 로그인 없이 볼 수 있어요. 피드·일정과 기록은 회원만 가능합니다.'}
                </Text>

                {mode === 'code' ? (
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    onSubmitEditing={verifyCode}
                    placeholder="참여 코드"
                    placeholderTextColor={c.textSecondary}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoFocus
                    style={[styles.input, field]}
                  />
                ) : (
                  <>
                    {mode === 'up' && (
                      <>
                        <TextInput
                          value={realName}
                          onChangeText={setRealName}
                          placeholder="이름"
                          placeholderTextColor={c.textSecondary}
                          autoFocus
                          style={[styles.input, field]}
                        />
                        <TextInput
                          value={nickname}
                          onChangeText={setNickname}
                          placeholder="닉네임 (피드에 보이는 이름)"
                          placeholderTextColor={c.textSecondary}
                          style={[styles.input, field]}
                        />
                      </>
                    )}
                    <TextInput
                      value={id}
                      onChangeText={setId}
                      placeholder="아이디"
                      placeholderTextColor={c.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input, field]}
                    />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      onSubmitEditing={submit}
                      placeholder={mode === 'in' ? '비밀번호' : '비밀번호 (6자 이상)'}
                      placeholderTextColor={c.textSecondary}
                      secureTextEntry
                      autoCapitalize="none"
                      style={[styles.input, field]}
                    />
                    {mode === 'up' && password.length > 0 && password.length < 6 && (
                      <Text style={[styles.sub, { color: c.textSecondary }]}>
                        비밀번호를 6자 이상 입력하세요 (현재 {password.length}자)
                      </Text>
                    )}
                  </>
                )}

                {(() => {
                  const disabled =
                    pending ||
                    (mode === 'code' ? !code.trim() : mode === 'in' ? !canSignIn : !canSignUp);
                  return (
                    <Pressable
                      onPress={mode === 'code' ? verifyCode : submit}
                      disabled={disabled}
                      accessibilityRole="button"
                      style={[
                        styles.button,
                        { backgroundColor: c.accent, opacity: disabled ? 0.4 : 1 },
                      ]}>
                      <Text style={[styles.buttonText, { color: c.onAccent }]}>
                        {pending
                          ? '확인 중…'
                          : mode === 'in'
                            ? '로그인'
                            : mode === 'code'
                              ? '다음'
                              : '가입하기'}
                      </Text>
                    </Pressable>
                  );
                })()}

                <Pressable
                  onPress={() => {
                    // 가입 양식에서는 코드 단계로 되돌아간다 — 코드를 잘못 받았을 때 빠져나갈 길.
                    setMode((m) => (m === 'in' ? 'code' : m === 'up' ? 'code' : 'in'));
                    setError(null);
                  }}
                  accessibilityRole="button"
                  style={styles.switch}>
                  <Text style={[styles.sub, { color: c.accent }]}>
                    {mode === 'in'
                      ? '처음이신가요? 참여 코드로 가입'
                      : mode === 'code'
                        ? '이미 계정이 있어요'
                        : '참여 코드 다시 입력'}
                  </Text>
                </Pressable>
              </>
            )}

            {error && <Text style={[styles.sub, { color: c.danger }]}>{error}</Text>}
          </ScrollView>
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
    maxHeight: '90%',
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  content: { padding: Spacing.four, gap: Spacing.three },
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
  switch: { minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center' },
});
