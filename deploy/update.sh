#!/bin/sh
# 업데이트 한 방 — GitHub에서 최신 코드를 받아 다시 빌드한다.
set -e
cd "$(dirname "$0")/.."
git pull
sh deploy/build.sh
echo "업데이트 완료. 태블릿에서 새로고침하면 반영됩니다."
