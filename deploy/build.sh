#!/bin/sh
# MeePick 정적 빌드 — NAS에 node를 설치하지 않고 Docker로 빌려 쓴다.
# DS218+(J3355)에서 첫 빌드는 10~20분 걸릴 수 있다. 이후에는 npm 캐시로 빨라진다.
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "오류: .env가 없습니다. 공개 값 2개를 넣어 만들어 주세요:"
  echo "  EXPO_PUBLIC_SUPABASE_URL=..."
  echo "  EXPO_PUBLIC_SUPABASE_ANON_KEY=..."
  echo "(SUPABASE_SECRET_KEY는 NAS에 둘 필요 없습니다 — 빌드에 쓰이지 않습니다)"
  exit 1
fi

docker run --rm \
  -v "$PWD":/app -w /app \
  -v meepick-npm-cache:/root/.npm \
  -e NODE_OPTIONS=--max-old-space-size=4096 \
  node:22-bookworm \
  sh -c "npm ci && npx expo export --platform web"

echo ""
echo "빌드 완료 → dist/  (nginx가 자동으로 새 파일을 서빙합니다)"
