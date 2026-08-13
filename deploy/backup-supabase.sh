#!/bin/sh
# MeePick — Supabase 데이터 백업 (Synology 작업 스케줄러가 매일 실행)
#
# plays(플레이 기록)·members(멤버)는 앱에만 존재하는 유일본이다 — 게임 목록과 달리
# 노션에서 복원할 수 없고, 무료 Supabase에는 자동 백업이 없다. 그래서 NAS가 매일
# 세 테이블 전체를 JSON으로 받아 둔다.
#
# 이 요청 자체가 Supabase의 "활동"으로 집계되므로 무료 프로젝트의 7일 무활동
# 일시정지도 함께 막는다 — 별도 킵얼라이브 작업이 필요 없다.
#
# 설정은 같은 폴더의 backup.env 에서 읽는다. deploy/publish-nas.ps1 이 PC의
# .env 값으로 자동 생성하며, 손으로 만들어도 된다:
#   SUPABASE_URL=https://xxxx.supabase.co
#   SUPABASE_ANON_KEY=sb_publishable_...
#
# 산출물: backups/<테이블>_<YYYY-MM-DD>.json  (1000행 넘으면 _part2, _part3…)
# 보관:   90일 지난 파일은 지우되, 매월 1일자 파일은 영구 보관한다.
# 복원:   표준 PostgREST JSON 배열이다. 필요해지면 insert문 변환이나 REST upsert로
#         되돌린다 — 그때 스크립트를 요청할 것.

set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/backups"
LOG="$OUT/backup.log"
STAMP="$(date +%Y-%m-%d)"
PAGE=1000    # Supabase REST가 한 번에 주는 최대 행수

[ -f "$DIR/backup.env" ] || { echo "backup.env가 없습니다: $DIR/backup.env" >&2; exit 1; }
. "$DIR/backup.env"

# 윈도우에서 편집하면 값 끝에 CR(\r)이 붙는다 — curl이 조용히 이상해지므로 제거한다.
SUPABASE_URL="$(printf '%s' "${SUPABASE_URL:-}" | tr -d '\r')"
SUPABASE_ANON_KEY="$(printf '%s' "${SUPABASE_ANON_KEY:-}" | tr -d '\r')"
[ -n "$SUPABASE_URL" ] || { echo "backup.env에 SUPABASE_URL이 없습니다" >&2; exit 1; }
[ -n "$SUPABASE_ANON_KEY" ] || { echo "backup.env에 SUPABASE_ANON_KEY가 없습니다" >&2; exit 1; }

mkdir -p "$OUT"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

status=0
summary=""

for table in games members plays; do
  offset=0; part=1; rows=0; ok=1
  while :; do
    if [ "$part" -eq 1 ]; then file="$OUT/${table}_${STAMP}.json"
    else file="$OUT/${table}_${STAMP}_part${part}.json"; fi
    hdr="$file.hdr"

    if ! curl -sS -f --connect-timeout 20 --max-time 180 \
         -H "apikey: $SUPABASE_ANON_KEY" -H "Prefer: count=exact" \
         -D "$hdr" -o "$file.tmp" \
         "$SUPABASE_URL/rest/v1/$table?select=*&order=id.asc&limit=$PAGE&offset=$offset"; then
      rm -f "$file.tmp" "$hdr"; ok=0; break
    fi

    # 본문이 JSON 배열로 시작하는지 최소 확인 (에러 페이지를 백업으로 착각하지 않게)
    case "$(head -c 1 "$file.tmp")" in
      "[") ;;
      *) rm -f "$file.tmp" "$hdr"; ok=0; break ;;
    esac

    # content-range: 0-152/153  (빈 테이블은 */0)
    range="$(tr -d '\r' < "$hdr" | awk 'tolower($1)=="content-range:"{print $2}')"
    rm -f "$hdr"
    span="${range%%/*}"
    if [ -z "$range" ] || [ "$span" = "*" ]; then got=0
    else got=$(( ${span##*-} - ${span%%-*} + 1 )); fi

    mv "$file.tmp" "$file"
    rows=$((rows + got))
    [ "$got" -lt "$PAGE" ] && break      # 마지막 페이지
    offset=$((offset + PAGE)); part=$((part + 1))
  done

  if [ "$ok" -eq 1 ]; then
    if [ "$part" -gt 1 ]; then summary="$summary ${table}:${rows}행(${part}파일)"
    else summary="$summary ${table}:${rows}행"; fi
  else
    status=1; summary="$summary ${table}:실패"
  fi
done

# 90일 지난 백업 정리 — 매월 1일자(*_YYYY-MM-01.json)는 영구 보관
find "$OUT" -name '*.json' -mtime +90 ! -name '*_????-??-01.json' -delete 2>/dev/null

log "$summary"
tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"

[ "$status" -eq 0 ] || { echo "백업 실패:$summary" >&2; exit 1; }
