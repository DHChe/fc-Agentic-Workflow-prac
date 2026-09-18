import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";

import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { MESSAGES } from "@/lib/messages";
import { processDocument } from "@/lib/pipeline/process-document";
import { createDocumentBodySchema } from "@/lib/upload/rules";
import {
  getBlobStoreHost,
  mimeFromExt,
  validateBlobUrl,
} from "@/lib/upload/validate";
import { claimUpload } from "@/lib/usage/limit";

export const maxDuration = 300;

class UploadClaimError extends Error {}

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json(
        { error: MESSAGES.api.unauthorized },
        { status: 401 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: MESSAGES.api.badRequest },
        { status: 400 },
      );
    }

    const parsed = createDocumentBodySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: MESSAGES.api.badRequest },
        { status: 400 },
      );
    }

    const { blobUrl, fileName } = parsed.data;
    const pathCheck = validateBlobUrl(blobUrl, userId, getBlobStoreHost());

    if (!pathCheck.ok) {
      return Response.json(
        { error: MESSAGES.api.badRequest },
        { status: 400 },
      );
    }

    const documentId = randomUUID();

    try {
      await getDb().transaction(async (tx) => {
        const claimed = await claimUpload(tx, {
          uploadId: pathCheck.uploadId,
          userId,
          documentId,
        });

        if (!claimed) {
          throw new UploadClaimError();
        }

        await tx.insert(documents).values({
          id: documentId,
          userId,
          docType: "unknown",
          status: "processing",
          originalUrl: blobUrl,
          originalMime: mimeFromExt(pathCheck.ext),
        });
      });
    } catch (error) {
      if (error instanceof UploadClaimError) {
        return Response.json(
          { error: MESSAGES.api.badRequest },
          { status: 400 },
        );
      }

      throw error;
    }

    after(() => processDocument(documentId, { fileName }));

    return Response.json({ documentId }, { status: 201 });
  } catch (error) {
    console.error("documents-create", { step: "create-document", error });

    return Response.json(
      { error: MESSAGES.api.internal },
      { status: 500 },
    );
  }
}
