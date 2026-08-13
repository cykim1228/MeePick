#!/bin/sh
# 업데이트 한 방 — GitHub에서 최신 코드를 받아 다시 빌드한다.
# DSM에는 git이 없는 경우가 많으므로 pull도 Docker로 한다 (clone과 같은 방식).
set -e
cd "$(dirname "$0")/.."

if command -v git >/dev/null 2>&1; then
  git pull
else
  docker run --rm -v "$PWD":/repo -w /repo alpine/git pull
fi

sh deploy/build.sh
echo "업데이트 완료. 태블릿에서 새로고침하면 반영됩니다."
