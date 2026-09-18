#!/bin/sh
# Stop 훅: lint → build → test. (.claude/settings.json의 Stop 훅과 같은 검사)
# Codex의 Stop 훅은 stdout에 JSON만 허용하므로, 실패 출력을 systemMessage(경고)로 감싼다.
cd "$(git rev-parse --show-toplevel)" || exit 0
[ -f package.json ] || exit 0

out=$(npm run lint 2>&1 && npm run build 2>&1 && npm run test 2>&1) && exit 0
printf '%s' "$out" | tail -n 40 | jq -Rs '{systemMessage: ("lint/build/test 실패:\n" + .)}'
