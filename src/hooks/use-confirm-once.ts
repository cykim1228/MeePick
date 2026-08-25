import { useCallback, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

/**
 * '바깥을 건드리면 닫힌다'는 동작의 공통 뼈대.
 *
 * 해제와 누름이 같은 제스처에서 겹치는 문제를 ref로 푼다 — 컨테이너가 먼저(capture)
 * "이번 제스처가 시작될 때 무엇이 열려 있었는지"를 적어두고, 버튼은 그 기록을 본다.
 * 상태값으로 판단하면 이미 해제된 뒤라 자기 버튼의 두 번째 누름을 영영 알아채지 못한다.
 */
function useOutsideDismiss<T extends string>() {
  const [openId, setOpenId] = useState<T | null>(null);
  const currentRef = useRef<T | null>(null);
  /** 이번 제스처가 시작될 때 열려 있던 대상. */
  const atGestureStart = useRef<T | null>(null);
  /** 열린 내용물(팝업 메뉴 등)의 노드. 그 안에서 시작된 터치는 '바깥'이 아니다. */
  const contentRef = useRef<unknown>(null);

  // effect 의존성에 넣을 수 있도록 신원을 고정한다.
  const set = useCallback((id: T | null) => {
    currentRef.current = id;
    setOpenId(id);
  }, []);

  /**
   * 이 제스처가 열린 내용물 안에서 시작됐는가.
   *
   * 이 판단이 없으면 메뉴 항목을 누르는 순간 메뉴가 먼저 닫히고, 누르던 대상이 사라져
   * **누름 자체가 없던 일이 된다.** 마우스는 click 이벤트가 뒤늦게 한 번 더 오지만
   * 터치에는 그 구제가 없어서, 태블릿에서만 "눌러도 아무 일이 없다"가 된다.
   *
   * 웹에서는 DOM 포함 관계로 판단한다. 네이티브에는 contains가 없어 false가 되고,
   * 예전과 같은 동작으로 남는다(이 앱은 웹으로만 배포한다).
   */
  const startedInsideContent = (e: GestureResponderEvent): boolean => {
    const node = contentRef.current as { contains?: (n: unknown) => boolean } | null;
    if (!node?.contains) return false;
    const ev = e as unknown as { target?: unknown; nativeEvent?: { target?: unknown } };
    const target = ev.target ?? ev.nativeEvent?.target;
    return Boolean(target && node.contains(target));
  };

  const bind = {
    onStartShouldSetResponderCapture: (e: GestureResponderEvent) => {
      atGestureStart.current = currentRef.current;
      if (currentRef.current !== null && !startedInsideContent(e)) set(null);
      // 책임을 가로채지 않는다 — 버튼이 자기 누름을 그대로 받아야 한다.
      return false;
    },
  };

  /** 이번 제스처가 이 대상을 향한 '두 번째' 접촉인가 */
  const wasOpen = (id: T) => {
    if (atGestureStart.current !== id) return false;
    atGestureStart.current = null;
    return true;
  };

  return { openId, set, bind, wasOpen, contentRef };
}

/**
 * '한 번 더 눌러 확인' 버튼의 상태.
 *
 * 두 번 눌러야 지워지는 방식은 실수 삭제를 막지만, 확인 상태가 그대로 남아 있으면
 * 나중에 무심코 한 번 더 눌렀을 때 곧바로 지워진다. 그래서 **다른 곳을 건드리면
 * 원래대로 돌아가야** 한다.
 *
 * 화면 컨테이너에 `bind`를 펼쳐 주면 그 안에서 시작되는 모든 터치가 확인을 해제한다.
 * 여기서는 버튼이 사라지지 않고 글자만 바뀌므로 '내용물' 예외가 필요 없다.
 */
export function useConfirmOnce<T extends string>() {
  const { openId, set, bind, wasOpen } = useOutsideDismiss<T>();

  return {
    /** 지금 확인 대기 중인 항목 */
    pendingId: openId,

    /** 화면 컨테이너 View에 펼친다. 여기서 시작되는 터치가 확인을 해제한다. */
    bind,

    /** 바깥 사정으로 확인을 접어야 할 때(대상이 바뀜, 시트가 닫힘 등). */
    reset: useCallback(() => set(null), [set]),

    /**
     * 버튼 onPress에서 부른다.
     * 두 번째 누름이면 onConfirm을 실행하고, 아니면 이 항목을 확인 대기로 만든다.
     */
    press: (id: T, onConfirm: () => void) => {
      if (wasOpen(id)) onConfirm();
      else set(id);
    },
  };
}

/**
 * 열어 둔 채 남지 않는 팝업 메뉴(⋯ 수정/삭제)의 상태.
 *
 * `bind`는 카드 루트에, **`contentBind`는 메뉴 상자에** 펼친다. 둘을 함께 달아야
 * "바깥을 누르면 닫히고, 메뉴 항목을 누르면 그 항목이 동작한다"가 모두 성립한다.
 * contentBind를 빠뜨리면 터치 기기에서 메뉴 항목이 먹통이 된다.
 */
export function useMenuToggle<T extends string>() {
  const { openId, set, bind, wasOpen, contentRef } = useOutsideDismiss<T>();

  return {
    /** 지금 열려 있는 메뉴 */
    openId,
    bind,
    /** 메뉴 상자에 펼친다. 이 안에서 시작된 터치는 메뉴를 닫지 않는다. */
    contentBind: { ref: contentRef as React.Ref<never> },
    close: useCallback(() => set(null), [set]),
    /** ⋯ 버튼 onPress에서 부른다. */
    toggle: (id: T) => {
      // 열려 있었다면 bind가 이미 닫았다. 여기서 다시 열면 닫히지 않는 메뉴가 된다.
      if (!wasOpen(id)) set(id);
    },
  };
}
