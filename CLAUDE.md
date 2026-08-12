@AGENTS.md

# MeePick

집에 있는 보드게임 소장 목록을 **인원별·테마별·카테고리별**로 훑고, 오늘 할 게임을 추천받는 태블릿 앱. 데이터 출처는 노션 데이터베이스이며 CSV로 내보내 임포트한다.

주 사용 환경은 **태블릿 가로**이며, 모바일에서도 레이아웃이 무너지지 않아야 한다.

카페 앱이 아니다 — 재고·대여·선반 위치 같은 운영 개념은 없다. 목록에 있는 게임은 전부 지금 집에 있다.

## 스택

- Expo SDK 57 / React Native 0.86 / React 19.2 / TypeScript 6.0
- expo-router (파일 기반 라우팅, 라우트 루트는 `src/app/`)
- Supabase (Postgres + RLS) — 설정은 [SUPABASE_SETUP.md](SUPABASE_SETUP.md)

## 실행

```bash
npm run web
```

Android 기기/에뮬레이터는 `npm run android`, 개발 서버만 띄우려면 `npm start`.

`.env`가 없으면 화면에 설정 안내 메시지가 뜬다. `SUPABASE_SETUP.md`를 따라 채우고 **개발 서버를 재시작**해야 반영된다.

## 폴더 규약

| 경로 | 용도 |
|------|------|
| `src/app/` | expo-router 라우트. **파일 경로가 곧 URL** (`src/app` 접두사와 `(group)`은 URL에서 제거됨) |
| `src/components/` | 공용 컴포넌트 |
| `src/constants/theme.ts` | 디자인 토큰 (`Colors`, `Spacing`, `Typography`, `Radius`, `TouchTarget`) |
| `src/hooks/` | 공용 훅. 파일명은 kebab-case (`use-breakpoint.ts`) |
| `src/features/games/` | `queries.ts`(조회) / `mappers.ts`(변환) / `recommend.ts`(필터·점수) / `hooks.ts`(화면 연결) |
| `src/features/plays/` | 플레이 세션 — 멤버·게임중·라운드 기록·통계(`stats.ts`). games와 같은 구조 |
| `src/app/+html.tsx`, `public/` | 웹 전용 HTML 셸과 PWA 매니페스트·아이콘. 네이티브 빌드와 무관 |
| `src/lib/` | `supabase.ts`, `database.types.ts` |
| `supabase/migrations/` | SQL 마이그레이션 (누적. 기존 파일 수정 금지) |
| `supabase/seed.sql` | **자동 생성** — `node scripts/import-notion.mjs`로 다시 만든다. 직접 수정 금지 |
| `scripts/import-notion.mjs` | 노션 CSV → `seed.sql` + `setup_all.sql` 생성 (제목 기준 upsert) |
| `scripts/upload-images.mjs` | 표지 이미지 리사이즈 → Supabase Storage 업로드. `.env`의 `SUPABASE_SECRET_KEY` 필요 |
| `_workspace/` | 노션 원본과 하네스 산출물. 커밋하지 않으며 삭제하지도 않는다 |

`@/` 별칭은 `src/`를 가리킨다.

## 도메인 규칙

- **인원은 min/max가 아니라 집합이다.** 노션이 가능/추천/베스트 3단계로 관리하므로 그대로 보존한다. min/max로 압축하면 "4인 가능하지만 5인이 베스트"가 사라진다.
- `10인+`는 `10`으로 저장하고 `supports10Plus`로 상한 없음을 표현한다.
- **추천 점수 가중치는 스펙의 일부다.** `src/features/games/recommend.ts`의 숫자를 화면에서 임의로 바꾸지 않는다.
- **방치도(`lastPlayedAt`)가 추천의 핵심 가치**다. 소장 목록이 고정된 집에서는 "안 하던 것 발굴"이 조건 충족만큼 중요하다. 플레이 기록 동선이 없으면 이 점수가 무의미해진다.
- **`image_file`과 `image_path`는 다른 것이다.** 앞은 노션 원본 파일명(업로드 스크립트가 로컬 파일을 찾는 용도), 뒤는 Storage 객체 키(화면에 표시하는 용도). 한 칼럼으로 합치면 노션 재임포트가 업로드 경로를 덮어쓴다.
- **노션 임포트는 `title_ko` 기준 upsert다.** `last_played_at`·`image_path`·앱에서 추가한 게임은 갱신 대상에서 제외되어 보존된다.
- **플레이 세션 모델:** `members`(등록된 사람) + `plays`(한 판 — `ended_at` null이면 게임중). 라운드는 `plays.rounds` jsonb 배열 `{winnerIds, coop}` — 협동 승리는 전원이 winnerIds에, 협동 패배는 빈 배열. 종료는 반드시 `end_play` RPC로 — `last_played_at` 갱신까지 한 트랜잭션이다.
- **오늘의 멤버는 추천 화면 앞의 게이트에서 정한다.** 인원수가 인원 필터 기본값이 되고, AsyncStorage로 새로고침을 넘긴다. 게임중이면 그 판의 멤버가 우선이다.
- 자세한 필드·enum·알고리즘은 `boardgame-domain` 스킬과 [_workspace/01_spec_dataprofile.md](_workspace/01_spec_dataprofile.md) 참조.

## 제약

- **모킹 금지.** 하드코딩 배열로 화면을 통과시키지 않는다. 실제 노션 데이터를 Supabase에 넣고 쿼리로 읽는다.
- **데이터 접근은 `src/features/games/queries.ts`를 경유한다.** 화면에서 `supabase.from()`을 직접 호출하지 않는다.
- **snake_case(DB) ↔ camelCase(앱) 변환은 `mappers.ts` 한 곳에서만** 한다.
- **디자인 토큰만 사용한다.** 색·간격·폰트 크기를 화면 코드에 리터럴로 쓰지 않는다.
- **반응형 분기는 `useBreakpoint()`로만** 한다. 화면에서 `width > 900` 같은 숫자를 직접 쓰지 않는다.
- `any` / `@ts-ignore` / 강제 제네릭 캐스팅으로 타입 에러를 덮지 않는다.
- **쓰기가 anon에 열려 있다.** 집에서 쓰는 앱이라 로그인을 두지 않은 결과이며 **보안 경계가 아니다** — URL과 publishable 키를 아는 사람은 목록을 수정할 수 있다. 외부에 배포하게 되면 Supabase Auth를 붙이고 `games_anon_*` 정책을 `authenticated`로 좁힌다.
- **`SUPABASE_SECRET_KEY`에 `EXPO_PUBLIC_` 접두사를 붙이지 않는다.** 붙이는 순간 RLS를 우회하는 키가 앱 번들에 들어간다.
- Expo 57은 이전 버전과 API가 다르다. 코드 작성 전 https://docs.expo.dev/versions/v57.0.0/ 를 확인한다.
- **커밋 메시지 양식**: 깃이모지 제목(예: `🎨 참여 현황 UI 강화 + 로컬 환경 정비`) + 간단한 `- ` 불릿 본문. `feat:` 같은 접두사는 쓰지 않는다. 쉽고 직관적으로.

## 하네스

이 프로젝트의 기능 작업은 루트 `C:\Projects\SideProjects\CLAUDE.md`에 등록된 에이전트 팀(`meepick-build` 스킬)으로 처리한다.
