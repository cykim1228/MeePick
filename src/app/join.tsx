import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { LoginModal } from '@/components/login-modal';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useMyProfile } from '@/features/community/hooks';
import { useAuthed } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/**
 * 초대 링크가 도착하는 곳 — `/join?code=<참여 코드>`.
 *
 * 코드를 말로 전하면 "숫자 뭐라고?"가 한 번은 오간다. 링크 하나로 끝내되, 조용히
 * 넘겨주지 않고 **무엇에 초대받았는지 보여 주는 화면**을 한 장 둔다 — 모르는 주소를
 * 눌렀을 때 곧바로 가입 양식이 뜨면 대개는 닫아 버린다.
 *
 * 이미 회원이면 축하할 일이 없으므로 바로 피드로 보낸다.
 */
export default function JoinScreen() {
  const c = useTheme();
  const t = useType();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const authed = useAuthed();
  const { isMember } = useMyProfile();
  const [open, setOpen] = useState(false);

  const code = typeof params.code === 'string' ? params.code.trim() : '';

  return (
    <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={styles.center}>
        <Icon name="dice" size={52} color={c.accent} />
        <Text style={[t.display, styles.title, { color: c.text }]}>MeePick</Text>

        {isMember ? (
          <>
            <Text style={[t.body, styles.line, { color: c.textSecondary }]}>
              이미 모임에 참여하고 있어요.
            </Text>
            <Pressable
              onPress={() => router.replace('/feed')}
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: c.accent }]}>
              <Text style={[t.body, styles.buttonText, { color: c.onAccent }]}>피드로 가기</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[t.body, styles.line, { color: c.text }]}>
              보드게임 모임에 초대받았어요
            </Text>
            <Text style={[t.caption, styles.line, { color: c.textSecondary }]}>
              모임의 사진·일정·게임 기록을 함께 봅니다.
              {code ? ' 참여 코드는 이미 채워져 있어요.' : ''}
            </Text>

            <Pressable
              onPress={() => setOpen(true)}
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: c.accent }]}>
              <Text style={[t.body, styles.buttonText, { color: c.onAccent }]}>
                {authed ? '참여하기' : '가입하고 참여하기'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace('/explore')}
              accessibilityRole="button"
              style={styles.secondary}>
              <Text style={[t.caption, { color: c.textSecondary }]}>
                먼저 게임 목록만 구경할게요
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* key로 코드가 바뀔 때 모달을 새로 만든다 — 초기값만 받는 구조라 그래야 반영된다. */}
      <LoginModal key={code} visible={open} initialCode={code} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.six,
  },
  title: { fontFamily: 'Jua_400Regular' },
  line: { textAlign: 'center' },
  button: {
    minHeight: TouchTarget.primary,
    justifyContent: 'center',
    paddingHorizontal: Spacing.six,
    borderRadius: Radius.full,
    marginTop: Spacing.two,
  },
  buttonText: { fontWeight: '700' },
  secondary: { minHeight: TouchTarget.min, justifyContent: 'center' },
});
