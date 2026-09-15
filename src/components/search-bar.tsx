import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useType } from '@/hooks/use-type';

/**
 * 검색 한 줄.
 *
 * 지우기 버튼을 따로 두는 이유: 폰에서 한 글자씩 지우려면 백스페이스를 열 번 넘게
 * 눌러야 하고, 그 사이 목록이 매번 다시 그려진다. 한 번에 비우는 문이 있어야 한다.
 */
export function SearchBar({
  value,
  onChange,
  placeholder,
  hint,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** 오른쪽 끝에 붙는 짧은 부가 정보(예: 결과 수). 줄을 하나 더 쓰지 않으려고 안에 넣는다. */
  hint?: string;
}) {
  const c = useTheme();
  const t = useType();

  return (
    <View style={[styles.wrap, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <Icon name="search" size={18} color={c.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        style={[styles.input, t.body, { color: c.text }]}
        // 웹에서 브라우저 기본 검색 UI(취소 X)가 우리 지우기 버튼과 겹치지 않게 한다.
        autoCorrect={false}
      />
      {!!hint && (
        <Text style={[t.caption, { color: c.textSecondary }]} numberOfLines={1}>
          {hint}
        </Text>
      )}
      {value.length > 0 && (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel="검색어 지우기"
          hitSlop={8}
          style={styles.clear}>
          <Icon name="close" size={16} color={c.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // 최소 터치 크기(44)에 맞춘다 — 검색은 화면의 주인공이 아니라서, 입력칸이 두꺼우면
    // 목록이 그만큼 아래로 밀린다.
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // minWidth: 0 이 없으면 flex 항목이 내용 너비 아래로 줄지 않아 오른쪽으로 삐져나간다.
  input: { flex: 1, minWidth: 0, paddingVertical: Spacing.one },
  clear: { alignItems: 'center', justifyContent: 'center' },
});
