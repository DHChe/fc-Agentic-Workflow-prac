# UI 디자인 가이드

## 디자인 원칙
1. 도구처럼 보여야 한다. 마케팅 페이지가 아니라 매일 쓰는 경비 정리 대시보드다. 표와 숫자가 주인공이다.
2. 라이트와 다크 모두 1급 시민이다. 컴포넌트는 아래 토큰 클래스만 쓰고, 테마별 색은 `globals.css`의 변수에서만 바꾼다.
3. 장식보다 밀도. 여백은 일정하게, 정보는 좌측 정렬로 스캔하기 쉽게.

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지, 반짝이 아이콘 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |
| 컴포넌트 안의 `dark:` 변형 | 토큰으로 해결한다. 누락과 불일치의 원인 |
| 이모지 아이콘 | 테마·플랫폼마다 다르게 보인다 |

## 색상
`globals.css`에서 `:root`(라이트)와 `.dark`에 정의하고 `@theme inline`으로 Tailwind에 연결한다. 컴포넌트는 오른쪽 열의 클래스만 사용한다.

### 배경·경계
| 토큰 | 라이트 | 다크 | 클래스 |
|------|--------|------|--------|
| 페이지 | #fafafa | #0a0a0a | `bg-page` |
| 카드 | #ffffff | #141414 | `bg-card` |
| 카드 hover / 표 줄무늬 | #f5f5f5 | #1a1a1a | `bg-card-2` |
| 경계선 | #e5e5e5 | #262626 | `border-line` |

### 텍스트
| 토큰 | 라이트 | 다크 | 클래스 |
|------|--------|------|--------|
| 주 텍스트 | #171717 | #fafafa | `text-fg` |
| 본문 | #404040 | #d4d4d4 | `text-fg-2` |
| 보조 | #737373 | #a3a3a3 | `text-fg-3` |
| 비활성 | #a3a3a3 | #737373 | `text-fg-4` |

### 포인트·시맨틱
| 용도 | 라이트 | 다크 | 클래스 |
|------|--------|------|--------|
| 포인트(링크, primary 버튼 배경) | #2563eb | #3b82f6 | `bg-accent` / `text-accent` |
| 성공 | #16a34a | #22c55e | `text-success` |
| 에러 | #dc2626 | #ef4444 | `text-error` / `border-error` |
| 경고 | #d97706 | #f59e0b | `text-warning` |

포인트 색은 한 화면에 한 곳(primary 액션)에만 쓴다.

## 컴포넌트
### 카드
```
rounded-lg bg-card border border-line p-6
```
### 버튼
```
Primary:   rounded-md bg-accent text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50
Secondary: rounded-md border border-line bg-card text-fg px-4 py-2 text-sm hover:bg-card-2
Text:      text-fg-3 hover:text-fg text-sm
Danger:    rounded-md border border-error text-error px-4 py-2 text-sm hover:bg-card-2
```
### 입력 필드
```
rounded-md bg-card border border-line px-3 py-2 text-sm text-fg placeholder:text-fg-4
focus:outline-none focus:ring-2 focus:ring-accent/40
에러 시: border-error + 아래 text-error text-xs 메시지
```
### 표 (분석 결과·목록)
```
컨테이너: overflow-x-auto (모바일에서 표가 페이지를 넓히지 않게)
w-full text-sm
thead: text-left text-fg-3 font-medium border-b border-line
tbody tr: border-b border-line hover:bg-card-2
금액 셀: text-right tabular-nums
```
### 배지 (문서 유형·카테고리)
```
inline-flex rounded-md border border-line px-2 py-0.5 text-xs text-fg-2
경고(확인 필요): 같은 형태에 text-warning border-warning
```
### 업로드 영역
```
rounded-lg border border-dashed border-line p-8 text-center
드래그 오버: border-accent
```

## 레이아웃
- 전체 너비: `max-w-5xl mx-auto px-6`. 인증 페이지만 `max-w-sm`.
- 정렬: 좌측 정렬 기본. 인증 카드와 빈 상태 메시지만 중앙 정렬 허용.
- 간격: 요소 간 `gap-3`~`gap-4`, 섹션 간 `space-y-8`.
- 앱 헤더: 높이 `h-14`, `border-b border-line`, 좌측 로고 텍스트 "SlipScan", 우측 테마 토글·로그아웃.

## 타이포그래피
| 용도 | 스타일 |
|------|--------|
| 랜딩 헤드라인 | `text-4xl font-semibold tracking-tight text-fg` |
| 페이지 제목 | `text-2xl font-semibold text-fg` |
| 섹션 제목 | `text-base font-medium text-fg` |
| 카드 제목 | `text-sm font-medium text-fg-3` |
| 요약 숫자 | `text-2xl font-semibold tabular-nums text-fg` |
| 본문 | `text-sm text-fg-2 leading-relaxed` |
| 보조 | `text-xs text-fg-3` |

금액은 `Intl.NumberFormat('ko-KR')`로 천 단위 구분 후 뒤에 `원`. 날짜는 `YYYY-MM-DD` 그대로 표시.

## 애니메이션
- 허용: 페이지 콘텐츠 fade-in (0.2s), 분석 중 스피너 회전, hover 색 전환 (`transition-colors`).
- 그 외 모든 애니메이션 금지. 스크롤 트리거, 파랄랙스, 카운트업 없음.

## 아이콘
- `lucide-react`, `strokeWidth={1.5}`, 크기 `size-4`(본문) / `size-5`(헤더).
- 아이콘을 둥근 배경 박스로 감싸지 않는다. 텍스트 옆에 나란히 둔다.
- 테마 토글: `Sun` / `Moon`. 업로드: `Upload`. 삭제: `Trash2`. 문서: `FileText`. 이미지: `Image`.
