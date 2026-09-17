# UI 디자인 가이드

색상, 컴포넌트, 레이아웃, 타이포그래피, 아이콘 규칙은 Claude Design 산출물 `docs/design.md`에서 확정한다(하네스 실행기가 `docs/*.md`만 매 step에 넣어 주므로 위치는 `docs/`다). 확정 전까지 이 문서의 규칙은 아래 두 가지만이다.

## 테마
- 기기의 라이트/다크 설정을 따른다(`prefers-color-scheme`). 앱 안에 전환 버튼은 없다 (ARCHITECTURE ADR-16).
- 색은 shadcn/ui 토큰(`bg-background`, `text-foreground`, `text-muted-foreground` 등)만 쓴다. 컴포넌트에 `dark:` 접두어를 직접 붙이지 않는다.

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |
