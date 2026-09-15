import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/** 회원·글 화면의 본문 폭. 머리줄도 같은 폭에 맞춘다. */
export const DETAIL_MAX_WIDTH = 560;

/**
 * 탭 바에 없는 화면(회원 프로필·글)의 머리줄 — 뒤로 가기와 제목.
 *
 * 뒤로는 '왔던 화면'으로 간다(탭 설정이 history라서). 주소를 직접 열어 돌아갈 곳이 없으면
 * fallback으로 간다. 선은 화면 끝까지, 버튼과 제목은 본문 폭 안에 둔다 — 넓은 화면에서
 * 뒤로 버튼만 멀리 떨어지지 않게.
 */
export function BackHeader({ title, fallback }: { title: string; fallback: Href }) {
  const c = useTheme();
  const t = useType();

  return (
    <View style={[styles.head, { borderBottomColor: c.border }]}>
      <View style={styles.row}>
        <Pressable
          onPress={() => goBack(fallback)}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          style={styles.backButton}>
          {/* 오른쪽 꺾쇠를 뒤집어 '뒤로'로 쓴다 — 아이콘을 하나 더 그리지 않는다. */}
          <View style={styles.flip}>
            <Icon name="chevronRight" size={20} color={c.text} />
          </View>
        </Pressable>
        <Text style={[t.subtitle, styles.title, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}

/** 뒤로 가기 동작만 필요할 때(글을 지운 뒤 등). 머리줄의 버튼과 같은 규칙이다. */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

const styles = StyleSheet.create({
  head: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    maxWidth: DETAIL_MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  backButton: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flip: { transform: [{ scaleX: -1 }] },
  title: { flex: 1, minWidth: 0 },
});
