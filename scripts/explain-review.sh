#!/usr/bin/env bash
# 리뷰 취합본을 Gemini에게 넘겨 비개발자용 쉬운 말 설명 파일로 바꾼다.
#
# 사용법:
#   scripts/explain-review.sh reviews/2026-09-14_2315_plan-md-review.md
#   (보통은 Claude의 취합본 하나를 넘긴다. 여러 파일을 넘기면 이어 붙여 보낸다)
# 결과:
#   reviews/easy/2026-09-14_2315_plan-md-review-easy.md  (첫 입력 파일 이름 기준)
# 종료 코드:
#   0 정상 / 1 사용법·파일 오류 / 2 결과는 저장했지만 항목 수가 원문과 다름 / 3 모든 모델 실패(기존 결과 유지)
# 사전 조건:
#   ~/.gemini/.env 에 GEMINI_API_KEY 설정 (Google AI Studio에서 발급)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/prompts/explain-review.md"
# 무료 API 키로 쓸 수 있는 Flash 계열만. Pro 계열은 무료 한도 0.
# 앞 모델이 과부하(503)·하루 한도 초과(429)면 다음 모델로 넘어간다.
MODELS="gemini-3.5-flash gemini-2.5-flash"

if [ "$#" -lt 1 ]; then
  echo "사용법: $0 <리뷰파일> [리뷰파일...]" >&2
  exit 1
fi
for f in "$@"; do
  [ -f "$f" ] || { echo "파일 없음: $f" >&2; exit 1; }
done
[ -f "$TEMPLATE" ] || { echo "지침서 없음: $TEMPLATE" >&2; exit 1; }

first="$1"
outdir="$(dirname "$first")/easy"
base="$(basename "$first" .md)"
mkdir -p "$outdir"
out="$outdir/${base}-easy.md"

prompt="$(mktemp -t explain-review.XXXXXX)"
tmp_out="$(mktemp -t explain-review-out.XXXXXX)"
trap 'rm -f "$prompt" "$tmp_out"' EXIT
{
  cat "$TEMPLATE"
  for f in "$@"; do
    printf '\n\n===== 리뷰 원문: %s =====\n\n' "$f"
    cat "$f"
  done
} > "$prompt"

expected="$(cat "$@" | grep -cE '^\[(blocker|major|minor)\]' || true)"
echo "원문 지적 항목 수: $expected (파일 $#개)" >&2

# 결과는 임시 파일에 받고, 성공이 확인된 뒤에만 제자리로 옮긴다 (실패 시 기존 결과 보존).
ok=0
for model in $MODELS; do
  echo "Gemini($model)에게 전달 중... 보통 1~5분 걸립니다." >&2
  if gemini -m "$model" -e none \
       -p "위 지침서의 출력 형식대로 쉬운 말 버전을 작성하라. 도구를 쓰거나 파일을 읽지 마라. 입력에 포함된 리뷰 원문 본문만 사용하라. 형식 밖의 말은 덧붙이지 마라." \
       --approval-mode plan -o text < "$prompt" > "$tmp_out" \
     && grep -q '^## 원문 대조표' "$tmp_out"; then
    ok=1
    break
  fi
  echo "모델 $model 실패 (과부하·한도 초과 등). 다음 모델로 넘어갑니다." >&2
done
if [ "$ok" != 1 ]; then
  echo "오류: 모든 모델이 실패했습니다. 기존 결과 파일은 그대로 둡니다." >&2
  exit 3
fi
mv "$tmp_out" "$out"
chmod 644 "$out"

# 누락 검사: 원문 대조표의 행 수(헤더·구분선 제외)가 원문 항목 수와 같아야 한다
rows="$(awk '/^## 원문 대조표/{f=1; next} f && /^\|/{n++} END{print (n>2)?n-2:0}' "$out")"
echo "결과 저장: $out (모델: $model)" >&2
echo "대조표 행 수: $rows / 원문 항목 수: $expected" >&2
if [ "$rows" != "$expected" ]; then
  echo "경고: 항목 수가 다릅니다. 누락되거나 중복된 항목이 있는지 확인하세요." >&2
  exit 2
fi
