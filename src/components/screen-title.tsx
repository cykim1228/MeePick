import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/**
 * 화면 맨 위 제목.
 *
 * 화면마다 제목을 따로 짜면 크기·여백이 조금씩 어긋나 탭을 옮길 때마다 결이 튄다.
 * 특히 폰에서는 글자 크기가 화면 폭을 따라 줄어들어서(useType), 한 화면만 규칙이 달라도
 * 눈에 띈다. 한 곳에서 만들어 여섯 화면이 같은 것을 쓴다.
 *
 * 피드와 프로필은 예외다 — 피드는 글이 주인공이라 제목이 첫 화면을 먹으면 안 되고,
 * 프로필은 제목 자리에 사람 얼굴과 이름이 들어간다.
 */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const c = useTheme();
  const t = useType();

  return (
    <View style={styles.wrap}>
      <Text style={[t.display, { color: c.text }]}>{title}</Text>
      {/* 부제는 자리를 늘 차지한다 — 있을 때만 그리면 화면마다 제목 아래 간격이 달라진다. */}
      <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={1}>
        {subtitle ?? ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one, paddingBottom: Spacing.three },
});
