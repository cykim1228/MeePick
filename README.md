# 🎲 MeePick

집에 있는 보드게임을 한눈에 훑고, **오늘 모인 인원에게 딱 맞는 게임을 골라주는** 태블릿 앱.

노션으로 관리하던 소장 목록(150여 종)을 그대로 가져와서, "오늘 셋이서 30분짜리 가벼운 거"를
3~4번의 탭으로 찾고, 플레이 기록까지 남긴다.

## 주요 기능

**추천** — 오늘의 멤버를 고르면 그 인원수에 맞는 게임이 추천순으로 정렬된다.
시간·난이도·카테고리·테마·메커니즘 필터, 이름 검색, 못 정할 땐 🎲 룰렛.
사놓고 안 하던 게임(0회)이 위로 올라오는 방치도 점수가 추천의 핵심.

**플레이 기록** — 게임 시작 → 게임중 상태(경과 타이머) → 라운드별 우승자·개인 점수·메모 →
종료. 공동 우승과 협동 게임(승리/패배)을 지원한다. 선 뽑기 팝업과 턴 타이머 내장.

**기록·통계** — 날짜별 플레이 이력(편집·삭제 가능), 명예의 전당(우승 순위·연승 🔥·승률),
개인 최고 점수, 월별 플레이 통계와 월간 리포트, 게임별 전적.

**관리** — 게임 추가·수정·삭제, 위시리스트, 룰 영상(유튜브 링크), 모임 마무리 리캡.

## 스택

- **Expo SDK 57** (React Native + React Native Web) — 웹·안드로이드 한 코드베이스
- **expo-router** — 파일 기반 라우팅 (`src/app/`)
- **Supabase** — Postgres + RLS + Storage(표지 이미지)
- 데이터 원본: **노션 데이터베이스** (CSV 내보내기 → 제목 기준 upsert 동기화)

## 시작하기

```bash
npm install
```

1. Supabase 프로젝트 생성과 스키마 적용: [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
2. `.env` 작성 (`.env.example` 참고 — 공개 값 2개면 앱이 돈다)
3. 실행:

```bash
npm run web
```

## 데이터 동기화

노션에서 내보낸 zip을 `_workspace/00_input/`에 두고:

```bash
node scripts/import-notion.mjs --apply   # 목록을 DB에 동기화 (제목 기준 upsert)
node scripts/upload-images.mjs           # 표지 이미지 리사이즈 후 Storage 업로드
```

플레이 기록·업로드된 표지·앱에서 추가한 게임은 재동기화해도 보존된다.

## 배포 (Synology NAS)

정적 빌드를 NAS의 Docker(nginx)로 서빙한다. PC를 꺼도 태블릿에서 항상 열린다.
전체 절차와 Supabase 킵얼라이브 설정: [deploy/README.md](deploy/README.md)

## 폴더 구조

```
src/
  app/            화면 (expo-router — 파일 경로가 곧 URL)
  components/     공용 컴포넌트 (카드·시트·모달·타이머…)
  features/
    games/        게임 조회·매퍼·추천 점수·필터
    plays/        멤버·세션·플레이 기록·통계
  constants/      디자인 토큰 (팔레트·타이포·간격)
  hooks/          공용 훅 (브레이크포인트·그리드·타이머)
  lib/            Supabase 클라이언트·DB 타입·날짜 유틸
supabase/         마이그레이션 + 시드 (자동 생성)
scripts/          노션 임포트·이미지 업로드
deploy/           NAS 배포 구성 (Docker)
```

자세한 개발 규약은 [CLAUDE.md](CLAUDE.md) 참고.
