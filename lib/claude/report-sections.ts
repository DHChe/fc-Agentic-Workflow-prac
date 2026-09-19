// ARCHITECTURE 7.3이 글자 그대로 고정한 보고서 5개 섹션 제목.
// 서버 의존성이 없는 파일에 두어 Cypress 스펙이 이 상수 하나 때문에
// Claude SDK까지 브라우저 번들로 끌어오지 않게 한다.
export const REPORT_SECTION_TITLES = [
  "1. 기간 총 지출액과 거래 건수",
  "2. 카테고리별 금액·비율",
  "3. 큰 지출 상위 5건",
  "4. 눈에 띄는 점",
  "5. 한 문단 총평",
] as const;
