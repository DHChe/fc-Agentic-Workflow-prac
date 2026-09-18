import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type { CategoryKey } from "@/lib/categories";

export type DocType = "receipt" | "statement" | "other" | "unknown";
export type DocumentStatus = "processing" | "completed" | "failed";
export type ReportStatus = "generating" | "completed" | "abandoned";
export type UsageKind = "document" | "report";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    docType: text("doc_type").$type<DocType>().notNull(),
    status: text("status").$type<DocumentStatus>().notNull(),
    failureReason: text("failure_reason"),
    originalUrl: text("original_url").notNull(),
    originalMime: text("original_mime").notNull(),
    pageCount: integer("page_count"),
    modelUsed: text("model_used"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("documents_user_id_uploaded_at_index").on(
      table.userId,
      table.uploadedAt.desc(),
    ),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    transactedAt: timestamp("transacted_at", { withTimezone: true }).notNull(),
    dateEstimated: boolean("date_estimated").notNull().default(false),
    merchantName: text("merchant_name"),
    totalAmount: bigint("total_amount", { mode: "number" }),
    cardLast4: text("card_last4"),
    category: text("category").$type<CategoryKey>().notNull(),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    duplicateOf: uuid("duplicate_of").references(
      (): AnyPgColumn => transactions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("transactions_user_id_transacted_at_index").on(
      table.userId,
      table.transactedAt,
    ),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    month: text("month").notNull(),
    status: text("status").$type<ReportStatus>().notNull(),
    contentMd: text("content_md"),
    modelUsed: text("model_used"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("reports_user_id_created_at_index").on(
      table.userId,
      table.createdAt.desc(),
    ),
  ],
);

export const usageLog = pgTable(
  "usage_log",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").$type<UsageKind>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    documentId: uuid("document_id"),
  },
  (table) => [
    index("usage_log_user_id_created_at_index").on(
      table.userId,
      table.createdAt,
    ),
  ],
);
