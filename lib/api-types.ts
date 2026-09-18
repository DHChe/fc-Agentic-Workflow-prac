import type { CategoryKey } from "@/lib/categories";
import type { DocType, DocumentStatus } from "@/lib/db/schema";
import type { MonthStats } from "@/lib/stats/aggregate";

export type DashboardDocument = {
  id: string;
  docType: DocType;
  status: DocumentStatus;
  failureReason: string | null;
  transactionCount: number | null;
  totalAmount: number | null;
  uploadedAt: string;
};

export type DashboardResponse = {
  month: string;
  usage: { used: number; limit: 50 };
  stats: MonthStats;
  documents: DashboardDocument[];
};

export type TransactionItem = {
  id: string;
  transactedAt: string;
  dateEstimated: boolean;
  merchantName: string | null;
  totalAmount: number | null;
  cardLast4: string | null;
  category: CategoryKey;
  isDuplicate: boolean;
  duplicateOfDocumentId: string | null;
};

export type DocumentDetailResponse = {
  id: string;
  docType: DocType;
  status: DocumentStatus;
  failureReason: string | null;
  originalUrl: string;
  originalMime: string;
  modelUsed: string | null;
  uploadedAt: string;
  processedAt: string | null;
  totalAmount: number | null;
  transactions: TransactionItem[];
};

export type ApiError = { error: string };
