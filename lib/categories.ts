export const CATEGORY_KEYS = [
  "food_welfare",
  "transport_travel",
  "entertainment_client",
  "office_equipment",
  "it_telecom",
  "ads_outsourcing_education",
  "rent_utilities_vehicle",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  food_welfare: "식비·복리후생",
  transport_travel: "교통·출장",
  entertainment_client: "접대·고객미팅",
  office_equipment: "사무·소모품·장비",
  it_telecom: "IT·통신",
  ads_outsourcing_education: "광고·외주·교육",
  rent_utilities_vehicle: "임차·공과금·차량",
  other: "기타",
};
