import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { documents, reports, transactions, usageLog } from "./schema";

describe("database schema", () => {
  it("uses the required table names", () => {
    expect(
      [documents, transactions, reports, usageLog].map(
        (table) => getTableConfig(table).name,
      ),
    ).toEqual(["documents", "transactions", "reports", "usage_log"]);
  });

  it("keeps usage log entries after a document is deleted", () => {
    expect(getTableConfig(usageLog).foreignKeys).toHaveLength(0);
  });

  it("configures both transaction foreign keys with their delete actions", () => {
    const foreignKeys = getTableConfig(transactions).foreignKeys;
    const deleteActions = Object.fromEntries(
      foreignKeys.map((foreignKey) => [
        foreignKey.reference().columns[0]?.name,
        foreignKey.onDelete,
      ]),
    );

    expect(foreignKeys).toHaveLength(2);
    expect(deleteActions).toEqual({
      document_id: "cascade",
      duplicate_of: "set null",
    });
  });

  it("defines the four user-scoped indexes", () => {
    const indexNames = [documents, transactions, reports, usageLog].flatMap(
      (table) =>
        getTableConfig(table).indexes.map((tableIndex) => tableIndex.config.name),
    );

    expect(indexNames).toEqual([
      "documents_user_id_uploaded_at_index",
      "transactions_user_id_transacted_at_index",
      "reports_user_id_created_at_index",
      "usage_log_user_id_created_at_index",
    ]);
  });
});
