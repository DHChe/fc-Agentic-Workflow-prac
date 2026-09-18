export const MESSAGES = {
  empty: {
    documents: "아직 올린 문서가 없습니다. 첫 영수증을 올려 보세요.",
    stats: "이 기간에는 거래가 없습니다.",
    reports: "아직 만든 보고서가 없습니다.",
    detailNoTransactions:
      "추출할 거래가 없습니다. 영수증과 카드 명세서만 읽습니다.",
    detailProcessing: "분석 중입니다. 잠시 후 다시 확인해 주세요.",
  },
  upload: {
    invalidType: "JPG, PNG, PDF 파일만 올릴 수 있습니다.",
    tooLarge: "파일은 10MB까지 올릴 수 있습니다.",
    failed: "업로드에 실패했습니다. 다시 시도해 주세요.",
  },
  api: {
    badRequest: "요청이 올바르지 않습니다.",
    unauthorized: "로그인이 필요합니다.",
    documentNotFound: "문서를 찾을 수 없습니다.",
    reportNotFound: "보고서를 찾을 수 없습니다.",
    limitReached:
      "오늘 한도(50회)를 모두 사용했습니다. 한국 시간 자정에 초기화됩니다.",
    upstream: "분석 서비스가 일시적으로 응답하지 않습니다.",
    internal: "문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
    demoLoginFailed:
      "시연 계정에 들어가지 못했습니다. 잠시 후 다시 시도해 주세요.",
  },
  failure: {
    unreadable: "파일을 읽을 수 없습니다.",
    unparsable: "분석 결과를 해석하지 못했습니다.",
    upstream: "분석 서비스가 일시적으로 응답하지 않습니다.",
    tooManyPages: "PDF는 20페이지까지 처리할 수 있습니다.",
    encryptedPdf:
      "암호가 걸린 PDF는 처리할 수 없습니다. 암호를 풀어 저장한 뒤 올려 주세요.",
    timedOut: "처리 시간을 초과했습니다.",
    unknown: "알 수 없는 오류가 발생했습니다.",
  },
  report: {
    noTransactions: "이 기간에 집계할 거래가 없습니다.",
    leaveWarning:
      "보고서가 아직 완성되지 않았습니다. 지금 나가면 저장되지 않을 수 있습니다.",
    interrupted: "보고서 생성이 중단되었습니다. 다시 시도해 주세요.",
    saved: "보고서가 저장되었습니다.",
  },
  remove: {
    confirm:
      "이 문서와 추출된 거래를 삭제합니다. 이미 만든 보고서는 남습니다.",
    processingDisabled: "처리가 끝난 뒤 삭제할 수 있습니다.",
    done: "문서를 삭제했습니다.",
  },
  label: {
    status: {
      processing: "처리 중",
      completed: "완료",
      failed: "실패",
    },
    badge: {
      amountMissing: "금액 미인식",
      dateEstimated: "날짜 추정",
      duplicate: "중복(집계 제외)",
    },
    placeholder: "—",
    button: {
      demoLogin: "시연 계정으로 들어가기",
      signIn: "로그인",
      upload: "올리기",
      sample: "샘플로 해보기",
      createReport: "이 달 보고서 만들기",
      copy: "복사",
      viewOriginal: "원본 보기",
      openOriginal: "원본 열기",
      signOut: "로그아웃",
    },
    usage: (used: number) => `오늘 사용 ${used}/50`,
  },
  landing: {
    title: "영수증 사진을 올리면 지출 표와 월간 보고서가 됩니다",
    features: [
      {
        title: "사진과 PDF에서 거래 추출",
        body: "영수증 사진이나 카드 명세서 PDF를 올리면 날짜·가맹점·금액·카테고리를 표로 정리합니다.",
      },
      {
        title: "월별 통계와 중복 제외",
        body: "같은 결제가 영수증과 명세서에 함께 있어도 한 번만 셉니다.",
      },
      {
        title: "월간 보고서",
        body: "숫자는 코드가 계산하고 글은 Claude가 씁니다. 그대로 복사해 보낼 수 있습니다.",
      },
    ],
    notice1: "올린 파일은 분석을 위해 Anthropic API로 전송됩니다.",
    notice2:
      "시연 계정은 공개 계정입니다. 올린 파일은 다른 방문자에게도 보입니다.",
  },
  ui: {
    brand: "SlipScan",
    section: {
      upload: "업로드",
      stats: "월 통계",
      documents: "문서",
      reports: "보고서",
    },
    uploadPrompt: "영수증 사진이나 카드 명세서 PDF를 선택해 주세요.",
    uploadLimits: "JPG, PNG, PDF · 파일당 10MB · PDF는 20페이지까지",
    uploadDone:
      "올렸습니다. 분석이 끝나면 목록에 표시됩니다. 화면을 떠나도 됩니다.",
    documentType: {
      receipt: "영수증",
      statement: "카드명세서",
      other: "기타",
    },
    documentColumn: {
      status: "상태",
      type: "종류",
      transactions: "거래",
      total: "합계",
      uploadedAt: "올린 시각",
    },
    transactionColumn: {
      date: "거래일",
      merchant: "가맹점",
      amount: "금액",
      category: "카테고리",
      card: "카드",
    },
    statsColumn: {
      category: "카테고리",
      amount: "금액",
      ratio: "비율",
    },
    reportColumn: {
      period: "기간",
      createdAt: "만든 시각",
    },
    documentTotal: "문서 합계",
    documentTotalDescription:
      "추출된 금액의 합입니다. 중복으로 표시된 거래도 포함합니다.",
    statsDescription: "금액 미인식과 중복 거래는 뺐습니다.",
    transactionCount: (count: number) => `거래 ${count}건`,
    modelUsed: "사용 모델",
    dashboard: "대시보드",
    delete: "삭제",
    cancel: "취소",
    open: "열기",
    dashboardLink: "대시보드로 가기",
    pageNotFound: "페이지를 찾을 수 없습니다.",
    copied: "복사했습니다.",
    reportGenerating: "보고서 작성 중",
  },
} as const;

export type FailureCode = keyof typeof MESSAGES.failure;
