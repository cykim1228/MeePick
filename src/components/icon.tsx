import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * 단색 선 아이콘.
 *
 * 이모지를 쓰면 기기·OS마다 그림체와 색이 달라 팔레트와 따로 논다 —
 * 웜톤 종이색 위에 애플 이모지의 형광색이 얹히면 앱이 아니라 문서처럼 보인다.
 * 선 아이콘은 색을 넘겨받으므로 선택·비선택, 라이트·다크가 자동으로 맞는다.
 *
 * 24x24 좌표계에 stroke 1.8, 둥근 끝 — 본문 폰트의 굵기와 어울리는 값이다.
 */
export type IconName =
  | 'home'
  | 'calendar'
  | 'dice'
  | 'grid'
  | 'star'
  | 'list'
  | 'trophy'
  | 'user'
  | 'heart'
  | 'message'
  | 'more'
  | 'plus'
  | 'close'
  | 'image'
  | 'lock'
  | 'chevronRight'
  | 'search'
  | 'bell';

export function Icon({
  name,
  size = 24,
  color,
  filled = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  /** 하트처럼 '켜짐' 상태가 있는 아이콘을 채운다 */
  filled?: boolean;
}) {
  const c = useTheme();
  const stroke = color ?? c.text;
  const common = {
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <>
          <Path d="M3 10.2 12 3.2l9 7v10.1a1 1 0 0 1-1 1h-4.6v-6.4H8.6v6.4H4a1 1 0 0 1-1-1z" {...common} />
        </>
      )}

      {name === 'calendar' && (
        <>
          <Rect x="3.2" y="5" width="17.6" height="16" rx="2.4" {...common} />
          <Path d="M3.2 9.6h17.6M8 3v4M16 3v4" {...common} />
          <Circle cx="8.4" cy="14" r="1.1" fill={stroke} stroke="none" />
          <Circle cx="12" cy="14" r="1.1" fill={stroke} stroke="none" />
        </>
      )}

      {name === 'dice' && (
        <>
          <Rect x="3.5" y="3.5" width="17" height="17" rx="4" {...common} />
          <Circle cx="8.6" cy="8.6" r="1.35" fill={stroke} stroke="none" />
          <Circle cx="15.4" cy="15.4" r="1.35" fill={stroke} stroke="none" />
          <Circle cx="12" cy="12" r="1.35" fill={stroke} stroke="none" />
        </>
      )}

      {name === 'grid' && (
        <>
          <Rect x="3.5" y="3.5" width="7" height="7" rx="2" {...common} />
          <Rect x="13.5" y="3.5" width="7" height="7" rx="2" {...common} />
          <Rect x="3.5" y="13.5" width="7" height="7" rx="2" {...common} />
          <Rect x="13.5" y="13.5" width="7" height="7" rx="2" {...common} />
        </>
      )}

      {name === 'star' && (
        <Path
          d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"
          {...common}
          fill={filled ? stroke : 'none'}
        />
      )}

      {name === 'list' && (
        <>
          <Path d="M9 6.5h11M9 12h11M9 17.5h11" {...common} />
          <Circle cx="4.6" cy="6.5" r="1.2" fill={stroke} stroke="none" />
          <Circle cx="4.6" cy="12" r="1.2" fill={stroke} stroke="none" />
          <Circle cx="4.6" cy="17.5" r="1.2" fill={stroke} stroke="none" />
        </>
      )}

      {name === 'trophy' && (
        <>
          <Path d="M7 4h10v5.2a5 5 0 0 1-10 0z" {...common} />
          <Path d="M7 5.5H4.6a2.4 2.4 0 0 0 2.4 4M17 5.5h2.4a2.4 2.4 0 0 1-2.4 4" {...common} />
          <Path d="M12 14.3V17M8.6 20.6h6.8M9.8 20.6c0-1.6.9-2.6 2.2-2.6s2.2 1 2.2 2.6" {...common} />
        </>
      )}

      {name === 'user' && (
        <>
          <Circle cx="12" cy="8.2" r="4" {...common} />
          <Path d="M4.6 20.4c0-3.8 3.3-6.2 7.4-6.2s7.4 2.4 7.4 6.2" {...common} />
        </>
      )}

      {name === 'heart' && (
        <Path
          d="M12 20.2s-7.6-4.6-7.6-9.6a4.4 4.4 0 0 1 7.6-3 4.4 4.4 0 0 1 7.6 3c0 5-7.6 9.6-7.6 9.6z"
          {...common}
          fill={filled ? stroke : 'none'}
        />
      )}

      {name === 'message' && (
        <Path
          d="M20.4 12.4c0 3.9-3.8 7-8.4 7-1 0-2-.15-2.9-.42L4.2 20.4l1.5-3.6c-.9-1.2-1.4-2.6-1.4-4.1 0-3.9 3.8-7 8.4-7s8.4 3.1 8.4 7z"
          {...common}
        />
      )}

      {name === 'more' && (
        <>
          <Circle cx="5.5" cy="12" r="1.5" fill={stroke} stroke="none" />
          <Circle cx="12" cy="12" r="1.5" fill={stroke} stroke="none" />
          <Circle cx="18.5" cy="12" r="1.5" fill={stroke} stroke="none" />
        </>
      )}

      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...common} />}

      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...common} />}

      {name === 'image' && (
        <>
          <Rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.6" {...common} />
          <Circle cx="8.8" cy="9.6" r="1.7" {...common} />
          <Path d="M3.8 17l4.6-4.3 3.4 3 3-2.6 5.4 4.6" {...common} />
        </>
      )}

      {name === 'lock' && (
        <>
          <Rect x="4.6" y="10.4" width="14.8" height="10" rx="2.6" {...common} />
          <Path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" {...common} />
        </>
      )}

      {name === 'chevronRight' && <Path d="M9.5 5.5 16 12l-6.5 6.5" {...common} />}

      {name === 'bell' && (
        <>
          <Path
            d="M6.2 16.8V11a5.8 5.8 0 0 1 11.6 0v5.8l1.6 1.8H4.6z"
            {...common}
            fill={filled ? stroke : 'none'}
          />
          <Path d="M10 20.6a2.2 2.2 0 0 0 4 0" {...common} />
        </>
      )}

      {name === 'search' && (
        <>
          <Circle cx="10.8" cy="10.8" r="6.4" {...common} />
          <Path d="M15.6 15.6 20.4 20.4" {...common} />
        </>
      )}
    </Svg>
  );
}
