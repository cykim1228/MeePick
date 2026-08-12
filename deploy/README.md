# Synology NAS 배포 (DS218+ 기준)

MeePick 웹을 NAS에서 항상 서빙한다. PC를 꺼도 태블릿에서 앱이 열린다.
구성: **GitHub에서 clone → Docker로 빌드 → nginx 컨테이너가 정적 파일 서빙**.

NAS에는 node를 설치하지 않는다 — 빌드도 Docker로 한다. 필요한 것은 Container Manager뿐이다.

## 0. 준비 (DSM에서 1회)

1. **패키지 센터 → Container Manager 설치** (구버전 DSM은 "Docker")
2. **제어판 → 터미널 및 SNMP → SSH 서비스 활성화** (빌드 명령 실행용. 배포 후 꺼도 된다)
3. File Station에서 `docker` 공유 폴더 확인 (Container Manager 설치 시 생김)

## 1. 코드 받기 (SSH)

PC에서 `ssh 관리자계정@NAS주소` 로 접속한 뒤:

```sh
cd /volume1/docker
# git이 없는 DSM이 많으므로 clone도 Docker로 한다
sudo docker run --rm -v /volume1/docker:/repo -w /repo alpine/git \
  clone https://github.com/<계정>/meepick.git
cd meepick
```

> 비공개 저장소면 GitHub에서 Personal Access Token(repo 읽기)을 만들어
> `https://<계정>:<토큰>@github.com/<계정>/meepick.git` 형식으로 clone 한다.

## 2. 환경 변수 (.env)

빌드에 **공개 값 2개만** 필요하다. `SUPABASE_SECRET_KEY`는 NAS에 두지 않는다 —
빌드에 쓰이지 않고, 이미지 업로드 같은 관리 작업은 PC에서 하면 된다.

```sh
cat > .env <<'EOF'
EXPO_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable 키>
EOF
```

두 값은 Supabase 대시보드 → Project Settings → API에서 복사한다.

(이 두 값은 어차피 번들에 포함되는 공개 값이라 NAS에 있어도 위험하지 않다.)

## 3. 빌드

```sh
sudo sh deploy/build.sh
```

DS218+에서 첫 빌드는 10~20분 걸린다 (npm 설치 포함). 이후엔 캐시로 훨씬 빠르다.
완료되면 `dist/` 폴더가 생긴다.

## 4. 서빙 시작

```sh
cd deploy
sudo docker compose up -d
```

또는 Container Manager GUI → 프로젝트 → 생성 → 경로 `/volume1/docker/meepick/deploy` 선택.

**접속: `http://NAS주소:8088`** — 태블릿 브라우저에서 열고 "홈 화면에 추가".
포트를 바꾸려면 `docker-compose.yml`의 `8088`을 수정한다.

## 5. Supabase 잠들지 않게 (필수)

무료 Supabase는 7일간 요청이 없으면 일시정지된다. 모임이 월 1~2회라 반드시 걸리므로,
NAS가 매일 한 번 핑을 보내게 한다.

**DSM 제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트**
- 일정: 매일 1회 (시간 아무 때나)
- 실행 명령:

```sh
curl -s "<Supabase 프로젝트 URL>/rest/v1/games?select=id&limit=1" \
  -H "apikey: <publishable 키>" > /dev/null
```

이 요청 하나가 "활동"으로 집계되어 프로젝트가 계속 깨어 있는다.

## 6. 업데이트 (코드가 바뀌었을 때)

```sh
cd /volume1/docker/meepick
sudo sh deploy/update.sh
```

git pull → 재빌드까지 한 번에 된다. nginx는 재시작할 필요 없다(같은 폴더를 서빙하므로
새 파일이 즉시 반영). 태블릿에서 새로고침하면 끝.

## 알아둘 것

- **PWA 완전 설치(주소창 없는 standalone)는 https가 필요하다.** LAN http로는 홈 화면
  바로가기까지만 된다. 원하면 DSM의 역방향 프록시 + Let's Encrypt 인증서(DSM 내장)로
  https를 붙일 수 있다 — 필요해지면 요청할 것.
- NAS가 꺼져 있으면 앱도 안 열린다 (데이터는 클라우드라 무사하다).
- 표지 이미지·룰 영상은 각각 Supabase Storage·유튜브에서 오므로 인터넷은 필요하다.
