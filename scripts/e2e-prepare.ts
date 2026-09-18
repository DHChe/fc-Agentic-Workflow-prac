import { randomUUID } from "node:crypto";

import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";

import { getDb } from "../lib/db/client";
import {
  documents,
  reports,
  transactions,
  usageLog,
} from "../lib/db/schema";

function assertE2eEnvironment(): void {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("E2E data preparation is disabled in production");
  }
}

async function findUserId(email: string): Promise<string> {
  assertE2eEnvironment();

  if (!email) {
    throw new Error("E2E user email is required");
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required");
  }

  const client = createClerkClient({ secretKey });
  const users = await client.users.getUserList({ emailAddress: [email] });
  const user = users.data.find((candidate) =>
    candidate.emailAddresses.some(
      (address) => address.emailAddress.toLowerCase() === email.toLowerCase(),
    ),
  );

  if (!user) {
    throw new Error("Clerk development test user was not found");
  }

  return user.id;
}

export async function resetUser(email: string): Promise<null> {
  const userId = await findUserId(email);

  await getDb().transaction(async (tx) => {
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx.delete(documents).where(eq(documents.userId, userId));
    await tx.delete(reports).where(eq(reports.userId, userId));
    await tx.delete(usageLog).where(eq(usageLog.userId, userId));
  });

  return null;
}

export async function fillUsage(email: string): Promise<null> {
  const userId = await findUserId(email);

  await getDb()
    .insert(usageLog)
    .values(
      Array.from({ length: 50 }, () => ({
        id: randomUUID(),
        userId,
        kind: "document" as const,
        createdAt: new Date(),
      })),
    );

  return null;
}
