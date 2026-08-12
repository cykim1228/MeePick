import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * 웹 전용 HTML 셸 (expo-router).
 * PWA 매니페스트를 연결해 태블릿/폰 홈 화면에 "앱처럼" 설치할 수 있게 한다 —
 * 주소창 없는 전체화면(standalone)으로 뜬다. 네이티브 빌드에는 영향이 없다.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>MeePick</title>
        <meta name="description" content="집 보드게임 소장 목록 — 오늘 뭐 할지 골라주는 앱" />

        <link rel="manifest" href="/manifest.json" />
        {/* 팔레트와 동일한 값 — src/constants/theme.ts의 background */}
        <meta name="theme-color" content="#F7F2E9" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#161310" media="(prefers-color-scheme: dark)" />

        {/* iOS 홈 화면 추가 */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="MeePick" />

        <ScrollViewStyleReset />
        {/* 1) 배경을 팔레트와 맞춘다 — 흰 body가 비치는 것 방지.
            2) 문서 스크롤을 잠근다 — 스크롤은 목록(FlatList) 안에서만 일어나야 한다.
               페이지가 함께 스크롤되면 상단바가 밀려 올라가고, 모바일 주소창 수축과
               겹쳐 하단에 여분 영역이 생긴다. 100dvh는 주소창 변동까지 따라가는 높이다. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root { background-color: #F7F2E9; }
              @media (prefers-color-scheme: dark) {
                html, body, #root { background-color: #161310; }
              }
              html { height: 100%; }
              body {
                height: 100%;
                height: 100dvh;
                margin: 0;
                overflow: hidden;
                overscroll-behavior: none;
              }
              #root { height: 100%; overflow: hidden; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
