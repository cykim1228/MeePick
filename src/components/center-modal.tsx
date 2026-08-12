import type { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 가운데 팝업 카드 모달 — 게임 상세 표시용.
 * 우측 사이드 패널은 태블릿에서 목록을 짓누르고, 전체화면 모달은 맥락을 다 가린다.
 * 배경이 비치는 가운데 카드가 10인치 태블릿에서 가장 편하다는 실사용 피드백의 결과다.
 * 바깥을 누르면 닫힌다.
 */
export function CenterModal({
  visible,
  onClose,
  children,
}: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const c = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기">
        {/* 카드 내부 탭이 배경 닫기로 전파되지 않게 막는다 */}
        <Pressable
          style={[styles.card, { backgroundColor: c.background, borderColor: c.border }]}
          onPress={() => undefined}>
          {children}
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
    padding: 16,
  },
  card: {
    width: '94%',
    maxWidth: 640,
    height: '92%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
