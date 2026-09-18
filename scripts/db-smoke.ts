import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { count, eq } from "drizzle-orm";

import { getDb } from "../lib/db/client";
import { usageLog } from "../lib/db/schema";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  const db = getDb();
  let rolledBack = false;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(usageLog).values({
        id: randomUUID(),
        userId: "smoke-test",
        kind: "document",
      });

      throw new Error("intentional rollback");
    });
  } catch (error) {
    if (error instanceof Error && error.message === "intentional rollback") {
      rolledBack = true;
    } else {
      throw error;
    }
  }

  if (!rolledBack) {
    throw new Error("transaction did not throw");
  }

  const [result] = await db
    .select({ value: count() })
    .from(usageLog)
    .where(eq(usageLog.userId, "smoke-test"));

  if (result?.value !== 0) {
    throw new Error("transaction was not rolled back");
  }

  console.log("ok");
}

main()
  .then(() => process.exit(0))
  .catch(() => {
    console.error("db smoke failed");
    process.exit(1);
  });
