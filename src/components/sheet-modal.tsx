import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 무언가를 추가·수정하는 팝업.
 *
 * 전체화면 대신 가운데 카드를 쓴다 — 전체화면은 뒤에 있던 목록을 통째로 가려서
 * "지금 어디에 뭘 더하는 중인지"가 사라진다. 뒤가 어둡게 비치면 잠깐 들른 창이라는
 * 것이 보이고, 바깥을 눌러 나가는 길도 자연스럽다.
 *
 * 제목 줄과 ✕를 두지 않는다 — 바깥을 누르면 닫히고, 무엇을 하는 창인지는 안에 있는
 * 폼이 이미 말한다. 좁은 폰에서 그 한 줄이 차지하던 자리를 내용에 쓴다.
 *
 * 카드 높이는 **내용에 맞춘다.** 고정하면 짧은 폼이 큰 카드 위쪽에 붙어 떠 보인다.
 */
export function SheetModal({
  visible,
  onClose,
  children,
}: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const c = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기">
        {/* 카드 안쪽 터치가 배경 닫기로 전파되지 않게 막는다 */}
        <Pressable
          style={[
            styles.card,
            Shadow.card,
            { backgroundColor: c.background, borderColor: c.border },
          ]}
          onPress={() => undefined}>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
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
    // 가장자리 여백은 "뒤가 있다"를 보여줄 만큼만. 폰에서는 이 여백이 곧 잘리는 폭이 된다.
    padding: Spacing.two,
  },
  card: {
    width: '100%',
    maxWidth: 600,
    // 내용이 길면 여기서 멈추고 안에서 스크롤한다. 짧으면 그만큼만 차지한다.
    maxHeight: '92%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  // 안에 들어오는 폼들이 이미 자기 카드와 여백을 갖고 있다. 여기서 또 주면
  // 좁은 폰에서 그만큼 내용 폭이 깎여 글자가 잘린다.
  body: { padding: Spacing.two, gap: Spacing.three },
});
