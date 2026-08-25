import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Chip } from '@/components/chip';
import { Spacing } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useType } from '@/hooks/use-type';

export type ChipItem = {
  key: string;
  label: string;
  count?: number;
  selected?: boolean;
  onPress: () => void;
};

/**
 * Chip의 실제 치수 — 폭 추정이 여기 값과 어긋나면 한 줄이 두 줄로 밀린다.
 * 폰에서는 칩이 작아지므로(chip.tsx의 chipCompact) 추정값도 함께 줄인다.
 */
const SIZES = {
  wide: { padding: Spacing.three * 2, badge: 26 + Spacing.two },
  compact: { padding: Spacing.two * 2, badge: 20 + Spacing.one },
};
const CHIP_BORDER = 2;
const GAP = Spacing.two;

/**
 * 글자 폭 추정.
 *
 * 텍스트를 실제로 재려면 한 번 그려 보고 onLayout을 받아야 하는데, 그러면 칩이 깜빡이며
 * 자리를 잡는다. 한글은 거의 정사각(1em), 라틴·숫자는 그보다 좁다는 성질로 미리 계산하면
 * 깜빡임 없이 첫 프레임부터 맞는 개수가 나온다. 살짝 넉넉히 잡아 두 줄로 밀리는 쪽을 막는다.
 */
function estimateWidth(item: ChipItem, fontSize: number, size: typeof SIZES.wide): number {
  let text = 0;
  for (const ch of item.label) {
    text += /[　-鿿가-힯＀-￯]/.test(ch) ? fontSize : fontSize * 0.6;
  }
  return (
    Math.ceil(text) + size.padding + CHIP_BORDER + (item.count === undefined ? 0 : size.badge)
  );
}

/**
 * 필터 칩 줄 — 기본은 **한 줄만** 보여주고 나머지는 '더보기'로 편다.
 *
 * 조건이 여섯 축(인원·시간·난이도·카테고리·테마·메커니즘)이라, 각 축이 두세 줄씩 차지하면
 * 필터를 다 보기도 전에 스크롤이 길어져 정작 게임 목록이 화면 밖으로 밀린다.
 *
 * 접힌 상태에서도 **선택한 칩은 반드시 보인다** — 숨으면 무엇을 골랐는지도, 어떻게 푸는지도
 * 알 수 없게 된다.
 */
export function ChipRow({ items }: { items: ChipItem[] }) {
  const t = useType();
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.floor(e.nativeEvent.layout.width);
    setWidth((prev) => (Math.abs(prev - next) < 2 ? prev : next));
  };

  const size = useBreakpoint() === 'compact' ? SIZES.compact : SIZES.wide;
  const fontSize = t.body.fontSize;
  // 측정 전(width 0)에는 전부 그린다 — 빈 줄이 잠깐 보이는 것보다 낫다.
  const visible = width === 0 || expanded ? items : fitOneRow(items, width, fontSize, size);
  const hidden = items.length - visible.length;

  return (
    <View style={styles.row} onLayout={onLayout}>
      {visible.map((item) => (
        <Chip
          key={item.key}
          label={item.label}
          count={item.count}
          selected={item.selected}
          onPress={item.onPress}
        />
      ))}
      {(hidden > 0 || expanded) && (
        <Chip
          label={expanded ? '접기' : `더보기 (${hidden})`}
          onPress={() => setExpanded((v) => !v)}
        />
      )}
    </View>
  );
}

/** 한 줄에 들어가는 만큼만 남긴다. 선택된 칩은 자리를 먼저 차지한다. */
function fitOneRow(
  items: ChipItem[],
  width: number,
  fontSize: number,
  size: typeof SIZES.wide
): ChipItem[] {
  const widths = new Map(items.map((i) => [i.key, estimateWidth(i, fontSize, size)]));
  const total = items.reduce((sum, i, idx) => sum + (widths.get(i.key) ?? 0) + (idx ? GAP : 0), 0);
  if (total <= width) return items;

  // 넘치면 '더보기' 칩 자리를 빼고 다시 담는다.
  const moreWidth = estimateWidth({ key: '', label: '더보기 (99)', onPress: () => {} }, fontSize, size);
  const budget = width - moreWidth - GAP;

  // 선택된 칩부터 자리를 잡되, 화면에 그릴 때는 원래 순서를 지킨다 —
  // 고를 때마다 칩이 앞으로 튀어나오면 다음 칩의 위치를 예측할 수 없다.
  const picked = new Set<string>();
  let used = 0;
  for (const pass of [items.filter((i) => i.selected), items.filter((i) => !i.selected)]) {
    for (const item of pass) {
      const w = widths.get(item.key) ?? 0;
      const next = used + w + (picked.size ? GAP : 0);
      if (next > budget) continue;
      used = next;
      picked.add(item.key);
    }
  }
  return items.filter((i) => picked.has(i.key));
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
