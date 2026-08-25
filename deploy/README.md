# Synology NAS 배포 (DS218+ 기준)

MeePick 웹을 NAS에서 항상 서빙한다. PC를 꺼도 태블릿에서 앱이 열린다.
NAS가 하는 일은 **nginx 컨테이너로 정적 파일을 서빙하는 것** 하나뿐이다.

빌드를 어디서 하느냐로 두 가지 방식이 있다.

| | 방식 A — PC에서 빌드 (권장) | 방식 B — NAS에서 빌드 |
|---|---|---|
| 빌드 시간 | 약 30초 | 10~20분 (첫 빌드) |
| NAS 요구사항 | Container Manager만 | Container Manager + SSH |
| 업데이트 | PC에서 스크립트 1줄 | NAS에 SSH 접속 |
| 위험 | 없음 | DS218+는 RAM 2GB라 빌드 중 메모리 부족으로 죽을 수 있다 |

**DS218+에서는 방식 A를 쓴다.** 어차피 코드는 PC에서 고치므로 PC 의존이 늘어나지 않는다.

## 0. 준비 (DSM에서 1회)

**패키지 이름이 DSM 버전에 따라 다르다.** 패키지 센터에서 안 보인다면 이걸 먼저 확인한다.

| DSM 버전 | 패키지 센터에서 검색할 이름 | compose(프로젝트) GUI |
|---|---|---|
| 7.2 이상 | **Container Manager** | 있음 |
| 7.0 / 7.1 | **Docker** | **없음** — 컨테이너를 GUI로 직접 만든다 |
| 6.x | **Docker** | 없음 |

DS218+는 x86(Celeron J3355)이라 두 패키지 모두 지원한다.
`+`가 없는 DS218 / DS218j / DS218play는 ARM이라 Docker 자체가 없다 — 그 경우는 Web Station을 써야 한다.

1. **패키지 센터에서 위 표의 이름으로 검색 → 설치**
2. File Station에서 `docker` 공유 폴더 확인 (설치 시 자동으로 생김)
3. 그 안에 `meepick` 폴더를 만든다 → `/volume1/docker/meepick`

방식 A는 SSH가 필요 없다.

---

# 방식 A — PC에서 빌드해서 밀어 넣기

## 1. `.env` 작성 (PC, 1회)

빌드에 **공개 값 2개만** 필요하다. `SUPABASE_SECRET_KEY`는 빌드에 쓰이지 않으므로
NAS에 올라가지 않는다.

프로젝트 루트에 `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable 키>
```

두 값은 Supabase 대시보드 → Project Settings → API에서 복사한다.
(이 둘은 어차피 번들에 포함되는 공개 값이라 NAS에 있어도 위험하지 않다.)

## 2. 빌드 + 전송 (PC)

```powershell
.\deploy\publish-nas.ps1 -Target \\<NAS이름>\docker\meepick -MediaDir /volume1/photo/Server
```

`dist/`를 새로 빌드하고 `nginx.conf`·`docker-compose.yml`·`media-server.mjs`와 함께
NAS 공유 폴더로 복사한다. `dist`는 미러링이라 예전 해시 번들이 쌓이지 않는다.

### `-MediaDir` — 모임 사진이 쌓일 곳

**SMB 경로가 아니라 NAS 안쪽 경로**다. 컨테이너가 볼륨으로 붙이기 때문이다.
Photo 공유 폴더가 어느 볼륨에 있는지는 NAS만 아니, 한 번 확인해서 넘긴다:

```bash
ls -d /volume*/photo/Server
```

한 번 주면 대상 폴더의 `.env`에 남아, 다음 배포부터는 생략해도 그 값을 이어 쓴다.
잘못 잡으면 컨테이너는 멀쩡히 뜨고 사진만 엉뚱한 곳에 쌓이므로, 미디어 서버가 시작할 때
표식 파일(`.meepick-media`)을 확인해 로그로 알려 준다:

```bash
docker logs meepick-media | head -3
# [media] ✅ /data — Photo/Server 폴더를 찾았습니다.
```

⚠️ 표식이 없다는 경고가 뜨면 `.env`의 `MEDIA_DIR`을 고치고
`docker-compose up -d` 를 다시 실행한다.

> "이 시스템에서 스크립트를 실행할 수 없으므로" 오류가 나면 실행 정책 때문이다.
> 한 번만 풀어 주면 된다: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
> (또는 매번 `powershell -ExecutionPolicy Bypass -File .\deploy\publish-nas.ps1 ...`)

> SMB 경로가 안 잡히면 `-Target` 없이 실행해 `dist/`만 만든 뒤,
> File Station으로 `dist` 폴더와 `deploy/nginx.conf`, `deploy/nas/docker-compose.yml`을
> `/volume1/docker/meepick`에 직접 올려도 결과는 같다.

## 3. 서빙 시작 (DSM, 1회)

### DSM 7.2 이상 — Container Manager

**프로젝트 → 생성**
- 프로젝트 이름: `meepick`
- 경로: `/volume1/docker/meepick`
- 소스: 기존 `docker-compose.yml` 사용 → 다음 → 완료

### DSM 7.0 / 7.1 — Docker (compose GUI가 없다)

컨테이너를 손으로 한 번만 만들면 된다. compose 파일과 결과는 같다.

1. **레지스트리** 탭 → `nginx` 검색 → 다운로드 → 태그 **`alpine`** 선택
2. **이미지** 탭 → `nginx:alpine` 선택 → **실행**
3. 컨테이너 이름 `meepick-web`, **자동 재시작 활성화** 체크 → **고급 설정**
4. **볼륨** 탭에서 두 개를 추가한다 (둘 다 **읽기 전용** 체크)

   | 추가 방식 | NAS 경로 | 마운트 경로 |
   |---|---|---|
   | 폴더 추가 | `docker/meepick/dist` | `/usr/share/nginx/html` |
   | 파일 추가 | `docker/meepick/nginx.conf` | `/etc/nginx/conf.d/default.conf` |

5. **포트 설정** 탭 → 로컬 포트 `8089` / 컨테이너 포트 `80` / TCP
6. 적용 → 실행

> **레지스트리에서 "쿼리 실패"가 뜨면** DSM 7.1의 Docker가 쓰는 Docker Hub 태그 조회 API가
> 낡아서 그렇다. GUI를 포기하고 SSH로 하면 된다 — `docker pull`은 그 API를 안 쓴다.
>
> ```sh
> cd <배포폴더> && sudo docker-compose up -d
> ```
>
> DSM 7.1은 `docker compose`(띄어쓰기)가 아니라 **`docker-compose`**(하이픈)다.
>
> **배포 폴더 경로가 `/volume1`이 아닐 수 있다.** 볼륨이 여러 개면 `docker` 공유가
> `/volume3` 같은 다른 볼륨에 붙는다. 확인하려면:
> ```sh
> sudo find / -maxdepth 4 -type d -name meepick -not -path '*/@*' 2>/dev/null
> ```
> compose 파일은 상대 경로(`./dist`)를 쓰므로 어느 볼륨이든 그대로 동작한다.

### 접속

**`http://<NAS주소>:8089`** — 태블릿 브라우저에서 열고 "홈 화면에 추가".
포트를 바꾸려면 `deploy/nas/docker-compose.yml`의 `8089`(또는 GUI의 로컬 포트)를 수정한다.

주소창 없는 완전한 앱 설치(https)는 [https.md](https.md) — DSM 역방향 프록시가
`https://<DDNS도메인>:8088`을 이 컨테이너(8089)로 넘겨주는 구성이다.

## 4. 업데이트 (코드가 바뀌었을 때)

```powershell
.\deploy\publish-nas.ps1 -Target \\<NAS이름>\docker\meepick
```

끝. nginx는 재시작할 필요 없다 — 같은 폴더를 서빙하므로 새 파일이 즉시 반영된다.
태블릿에서 새로고침하면 된다.

> `media-server.mjs`나 `docker-compose.yml`이 바뀐 배포라면 그때만
> `docker-compose up -d`를 한 번 더 돌린다(컨테이너가 파일을 마운트해 들고 있어서다).

> **오프라인 셸**: 배포본은 서비스 워커(`public/sw.js`)를 등록해 앱 껍데기와 사진을
> 캐시한다. NAS가 꺼져 있어도 화면은 뜨고, 데이터만 "불러올 수 없음"으로 나온다.
> 워커 자체는 `nginx.conf`에서 캐시 금지라, 새 배포가 항상 이긴다.

---

# 방식 B — NAS에서 직접 빌드

PC 없이 NAS만으로 업데이트하고 싶을 때. NAS에 node는 설치하지 않고 빌드도 Docker로 한다.

**제어판 → 터미널 및 SNMP → SSH 서비스 활성화** 후 `ssh 관리자계정@NAS주소`:

```sh
cd /volume1/docker
# DSM에는 git이 없는 경우가 많으므로 clone도 Docker로 한다.
# 저장소 이름이 MeePick이라 대상 폴더명을 meepick으로 명시한다.
sudo docker run --rm -v /volume1/docker:/repo -w /repo alpine/git \
  clone https://github.com/cykim1228/MeePick.git meepick
cd meepick
```

> 비공개 저장소면 GitHub에서 Personal Access Token(repo 읽기)을 만들어
> `https://<계정>:<토큰>@github.com/cykim1228/MeePick.git` 형식으로 clone 한다.

clone한 폴더는 root 소유이므로 `.env` 작성에도 sudo가 필요하다:

```sh
sudo sh -c 'cat > .env' <<'EOF'
EXPO_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable 키>
EOF

sudo sh deploy/build.sh
cd deploy
sudo docker compose up -d
```

이쪽 `deploy/docker-compose.yml`은 저장소 루트의 `../dist`를 서빙한다.
업데이트는 `sudo sh deploy/update.sh` (git pull + 재빌드).

**주의:** DS218+는 RAM이 2GB라 `expo export` 중 메모리 부족으로 실패할 수 있다.
실패하면 DSM 제어판 → 하드웨어 및 전원에서 메모리 상태를 확인하거나, 방식 A로 돌아간다.

---

## 5. 매일 백업 = 킵얼라이브 (두 방식 공통, 필수)

이 작업 하나가 두 가지를 해결한다:

1. **백업** — `plays`(플레이 기록)·`members`는 앱에만 존재하는 유일본이다. 게임 목록과
   달리 노션에서 복원할 수 없고, 무료 Supabase에는 자동 백업이 없다.
2. **정지 방지** — 무료 Supabase는 7일간 요청이 없으면 일시정지되는데(모임이 월 1~2회라
   반드시 걸린다), 백업 요청 자체가 "활동"으로 집계되어 프로젝트가 계속 깨어 있는다.

`publish-nas.ps1`이 `backup-supabase.sh`와 설정(`backup.env`)을 배포 폴더에 같이
올려 두므로, NAS에서는 예약만 걸면 된다.

**DSM 제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트**
- 작업 이름: `meepick-backup`, 사용자: `root`
- 일정: 매일 1회 (시간 아무 때나)
- 실행 명령 (배포 폴더 경로에 맞춰서):

```sh
sh /volume1/docker/meepick/backup-supabase.sh
```

결과는 배포 폴더의 `backups/`에 테이블별 날짜 파일(`plays_2026-08-13.json` 등)로
쌓인다. 90일 지난 파일은 자동 정리되며 매월 1일자는 영구 보관된다. 실행 이력은
`backups/backup.log`에 남는다.

- 만든 뒤 목록에서 선택 → **실행**으로 한 번 돌려 `backups/`가 생기는지 확인한다.
- 배포 스크립트는 `dist/`만 미러링하므로 `backups/`는 재배포해도 안전하다.
- `backups/`는 NAS 안에만 있다. NAS 디스크 고장까지 대비하려면 Hyper Backup 대상에
  이 폴더를 포함시킨다.
- 작업 스케줄러 → 설정에서 "비정상 종료 시 이메일 알림"을 켜 두면 백업 실패(스크립트가
  0이 아닌 코드로 종료)를 놓치지 않는다.

## 알아둘 것

- **PWA 완전 설치(주소창 없는 standalone)는 https가 필요하다.** LAN http로는 홈 화면
  바로가기까지만 된다. 절차는 [https.md](https.md) — DDNS + Let's Encrypt + 역방향
  프록시(8088→8089) + LAN 전용 DNS.
- NAS가 꺼져 있으면 앱도 안 열린다 (데이터는 클라우드라 무사하다).
- 표지 이미지·룰 영상은 각각 Supabase Storage·유튜브에서 오므로 인터넷은 필요하다.
- **쓰기가 anon에 열려 있다.** 8088·8089 포트를 라우터에서 포워딩하지 않는다.
  LAN 안에서만 쓴다.
