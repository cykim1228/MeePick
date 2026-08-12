# Supabase 설정 (최초 1회)

MeePick은 Supabase(Postgres)에 보드게임 목록을 두고 읽는다. 무료 티어로 충분하다.

## 1. 프로젝트 생성

1. https://supabase.com 에 가입하고 **New project** 클릭
2. 입력값
   - **Name**: `meepick`
   - **Database Password**: 아무거나 (강한 비밀번호로. 앱에서는 안 쓰지만 분실하면 DB 직접 접속이 불가능해진다)
   - **Region**: `Northeast Asia (Seoul)` — 집에서 쓰므로 가까울수록 빠르다
3. 생성까지 1~2분 걸린다

## 2. 스키마 적용

좌측 메뉴 **SQL Editor** → **New query**

[supabase/setup_all.sql](supabase/setup_all.sql) 내용을 **전부** 붙여넣고 **Run**. 스키마와 데이터 155종이 한 번에 들어간다.
`Success. No rows returned`가 나오면 정상이다.

> 나눠서 실행하려면 [migrations/20260810120000_create_games.sql](supabase/migrations/20260810120000_create_games.sql) → [seed.sql](supabase/seed.sql) 순서로 돌린다.
> 시드가 `truncate`로 시작하므로 테이블이 먼저 있어야 한다.

확인: 좌측 **Table Editor** → `games` 테이블에 155행이 보이면 완료.

## 3. 앱에 키 넣기

좌측 **Project Settings** → **API** 에서 두 값을 복사한다.

- **Project URL** (`https://xxxxx.supabase.co`)
- **anon public** 키 — 프로젝트 생성 시기에 따라 `eyJ...`(legacy JWT) 또는 `sb_publishable_...` 형태다. 둘 다 공개 전제로 만들어진 키라 앱에 넣어도 된다.

같은 화면의 **`service_role`** / **`sb_secret_...`** 키와 프로젝트 생성 시 입력한 **데이터베이스 비밀번호**는 넣지 않는다. 셋은 서로 다른 값이고, 앞의 둘은 RLS를 우회하며 마지막은 Postgres 직접 접속용이다.

프로젝트 루트에 `.env` 파일을 만들고 채운다. `.env.example`을 복사하면 된다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**`service_role` 키는 넣지 않는다.** RLS를 우회하므로 앱 번들에 들어가면 안 된다.
`.env`는 `.gitignore`에 있어 커밋되지 않는다.

환경 변수는 번들 시점에 주입되므로, `.env`를 만든 뒤 **개발 서버를 재시작**해야 반영된다.

## 4. 확인

```bash
npm run web
```

게임 목록이 뜨면 성공이다. 빈 목록이 나오면 아래를 확인한다.

| 증상 | 원인 | 해결 |
|------|------|------|
| 목록이 비어 있고 에러도 없음 | RLS 정책 미적용 | 1단계 마이그레이션의 `create policy games_public_read` 부분이 실행됐는지 확인 |
| `supabaseUrl is required` | `.env` 미반영 | `EXPO_PUBLIC_` 접두사 확인 후 개발 서버 재시작 |
| `relation "games" does not exist` | 마이그레이션 미실행 | 2단계를 다시 수행 |

## 5. 표지 이미지 업로드 (선택)

이미지는 앱 번들이 아니라 Supabase Storage에 둔다. 92장을 리사이즈해 올리고 `games.image_path`에 경로를 기록한다.

1. 대시보드 → **Project Settings** → **API** 에서 **`service_role`**(또는 `sb_secret_...`) 키를 복사
2. `.env`에 추가 — **`EXPO_PUBLIC_` 접두사를 붙이지 않는다.** 붙이면 앱 번들에 들어가고, 이 키는 RLS를 우회한다.

```dotenv
SUPABASE_SECRET_KEY=여기에_secret_키
```

3. 실행

```bash
node scripts/upload-images.mjs
```

이미 올린 것은 건너뛴다. 전부 다시 올리려면 `--force`를 붙인다.
원본 최대 2.9MB가 폭 600px WebP로 줄어 전체가 5MB 안쪽이 된다.

## 6. 스키마 업데이트가 나왔을 때

기능이 추가되면 `supabase/migrations/`에 새 SQL 파일이 생긴다. **가장 최근 파일만** SQL Editor에 붙여넣고 Run 하면 된다 (파일들은 재실행해도 안전하게 작성돼 있다).

현재 최신: `20260812120000_rule_video.sql` — 룰 영상(유튜브 링크) 컬럼. 노션 '룰 영상' 속성이 임포트되고, 상세 화면의 "룰 영상 보기" 버튼이 이 값을 연다.

## 7. 노션 데이터를 갱신했을 때

노션에서 다시 내보내기 → zip을 `_workspace/00_input/`에 넣고 압축 해제 → 아래 실행 후, 생성된 `supabase/seed.sql`을 SQL Editor에서 다시 Run.

```bash
node scripts/import-notion.mjs
```

`seed.sql`은 자동 생성 파일이므로 직접 수정하지 않는다.

**제목 기준 upsert라 여러 번 실행해도 안전하다.** 노션에 없는 정보 — 플레이 기록(`last_played_at`), 업로드한 표지 경로(`image_path`), 앱에서 추가한 게임 — 은 갱신 대상에서 빠져 있어 보존된다.

노션에서 제목을 바꾸면 같은 게임이 새 행으로 들어가고 옛 행이 남는다. 제목이 자연 키이기 때문이며, 이때는 앱에서 옛 행을 삭제한다.
