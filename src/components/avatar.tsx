import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Typography } from '@/constants/theme';
import { postImageUrl } from '@/features/community/images';
import type { Profile } from '@/features/community/types';
import { useTheme } from '@/hooks/use-theme';

/**
 * 원형 프로필 사진. 사진이 없으면 이름 첫 글자를 띄운다 —
 * 기본 아바타 이미지를 두면 모두가 같은 회색 사람 모양이라 누가 누군지 구분되지 않는다.
 *
 * 이름과 사진 경로만 받는다. 계정이 없는 손님(플레이 기록의 멤버)도 같은 동그라미로 그려야
 * 기록·전당에서 회원과 손님이 나란히 보일 때 모양이 맞는다.
 */
export function Avatar({
  profile,
  size = 36,
}: {
  profile: Pick<Profile, 'displayName' | 'avatarPath'>;
  size?: number;
}) {
  const c = useTheme();
  const url = profile.avatarPath ? postImageUrl(profile.avatarPath) : null;
  const box = { width: size, height: size, borderRadius: Radius.full };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[box, { backgroundColor: c.backgroundSelected }]}
        contentFit="cover"
        transition={120}
        accessibilityIgnoresInvertColors
      />
    );
  }

  // 사진이 없을 때는 브랜드색 테두리를 둘러 '빈 회색 원'으로 보이지 않게 한다.
  return (
    <View
      style={[
        box,
        styles.fallback,
        { backgroundColor: c.backgroundSelected, borderColor: c.accent, borderWidth: 1.5 },
      ]}>
      <Text style={[styles.initial, { color: c.accent, fontSize: size * 0.44 }]}>
        {profile.displayName.slice(0, 1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { ...Typography.body, fontWeight: '700' },
});
