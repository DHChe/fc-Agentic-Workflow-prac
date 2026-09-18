import type { CategoryKey } from "@/lib/categories";

export type SeedTransaction = {
  id: string;
  transactedAt: string;
  dateEstimated: boolean;
  merchantName: string;
  totalAmount: number;
  cardLast4: string;
  category: CategoryKey;
};

export type SeedDocument = {
  id: string;
  uploadedAt: string;
  docType: "receipt" | "statement";
  assetFile: string;
  transactions: SeedTransaction[];
};

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    uploadedAt: "2026-08-03T18:40:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/01.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        transactedAt: "2026-08-03T12:18:00+09:00",
        dateEstimated: false,
        merchantName: "김밥천국 역삼점",
        totalAmount: 18_500,
        cardLast4: "1234",
        category: "food_welfare",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    uploadedAt: "2026-08-07T22:05:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/02.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-000000000002",
        transactedAt: "2026-08-07T21:15:00+09:00",
        dateEstimated: false,
        merchantName: "카카오T 택시",
        totalAmount: 12_400,
        cardLast4: "1234",
        category: "transport_travel",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    uploadedAt: "2026-08-12T17:10:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/03.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-000000000003",
        transactedAt: "2026-08-12T14:32:00+09:00",
        dateEstimated: false,
        merchantName: "오피스디포 강남점",
        totalAmount: 64_900,
        cardLast4: "1234",
        category: "office_equipment",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    uploadedAt: "2026-08-19T22:20:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/04.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-000000000004",
        transactedAt: "2026-08-19T19:08:00+09:00",
        dateEstimated: false,
        merchantName: "한우마당 선릉점",
        totalAmount: 286_000,
        cardLast4: "5678",
        category: "entertainment_client",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    uploadedAt: "2026-08-27T18:30:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/05.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-000000000005",
        transactedAt: "2026-08-27T16:45:00+09:00",
        dateEstimated: false,
        merchantName: "교보문고 강남점",
        totalAmount: 45_000,
        cardLast4: "1234",
        category: "ads_outsourcing_education",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    uploadedAt: "2026-09-02T15:00:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/06.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-000000000006",
        transactedAt: "2026-09-02T12:10:00+09:00",
        dateEstimated: false,
        merchantName: "본도시락 역삼점",
        totalAmount: 42_000,
        cardLast4: "1234",
        category: "food_welfare",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    uploadedAt: "2026-09-05T09:30:00+09:00",
    docType: "statement",
    assetFile: "scripts/seed-assets/07.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-000000000007",
        transactedAt: "2026-08-22T03:14:00+09:00",
        dateEstimated: false,
        merchantName: "AWS",
        totalAmount: 132_000,
        cardLast4: "1234",
        category: "it_telecom",
      },
      {
        id: "20000000-0000-4000-8000-000000000008",
        transactedAt: "2026-08-25T09:00:00+09:00",
        dateEstimated: false,
        merchantName: "KT 통신요금",
        totalAmount: 88_000,
        cardLast4: "1234",
        category: "it_telecom",
      },
      {
        id: "20000000-0000-4000-8000-000000000009",
        transactedAt: "2026-08-28T08:35:00+09:00",
        dateEstimated: false,
        merchantName: "역삼주차장 정기권",
        totalAmount: 150_000,
        cardLast4: "1234",
        category: "rent_utilities_vehicle",
      },
      {
        id: "20000000-0000-4000-8000-00000000000a",
        transactedAt: "2026-08-30T17:42:00+09:00",
        dateEstimated: false,
        merchantName: "쿠팡 취소",
        totalAmount: -8_900,
        cardLast4: "1234",
        category: "office_equipment",
      },
      {
        id: "20000000-0000-4000-8000-00000000000b",
        transactedAt: "2026-09-03T14:37:00+09:00",
        dateEstimated: false,
        merchantName: "스타벅스 선릉로점",
        totalAmount: 23_000,
        cardLast4: "1234",
        category: "food_welfare",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    uploadedAt: "2026-09-06T10:10:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/08.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-00000000000c",
        transactedAt: "2026-09-03T14:37:00+09:00",
        dateEstimated: false,
        merchantName: "스타벅스 선릉로점",
        totalAmount: 23_000,
        cardLast4: "1234",
        category: "food_welfare",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000009",
    uploadedAt: "2026-09-10T18:20:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/09.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-00000000000d",
        transactedAt: "2026-09-10T07:45:00+09:00",
        dateEstimated: false,
        merchantName: "KTX 서울-부산",
        totalAmount: 59_800,
        cardLast4: "5678",
        category: "transport_travel",
      },
    ],
  },
  {
    id: "10000000-0000-4000-8000-00000000000a",
    uploadedAt: "2026-09-15T20:00:00+09:00",
    docType: "receipt",
    assetFile: "scripts/seed-assets/10.jpg",
    transactions: [
      {
        id: "20000000-0000-4000-8000-00000000000e",
        transactedAt: "2026-09-15T20:00:00+09:00",
        dateEstimated: true,
        merchantName: "다이소 역삼점",
        totalAmount: 9_500,
        cardLast4: "1234",
        category: "office_equipment",
      },
    ],
  },
];

export const SAMPLE_RECEIPT: {
  assetFile: "public/samples/receipt-sample.jpg";
  transaction: Omit<SeedTransaction, "id">;
} = {
  assetFile: "public/samples/receipt-sample.jpg",
  transaction: {
    transactedAt: "2026-09-09T12:24:00+09:00",
    dateEstimated: false,
    merchantName: "파리바게뜨 역삼점",
    totalAmount: 17_300,
    cardLast4: "9012",
    category: "food_welfare",
  },
};
