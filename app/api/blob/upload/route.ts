import { auth } from "@clerk/nextjs/server";
import { handleUpload } from "@vercel/blob/client";

import { MESSAGES } from "@/lib/messages";
import { decideUploadToken } from "@/lib/upload/rules";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_BYTES,
  validateUploadPath,
} from "@/lib/upload/validate";
import {
  countTodayUsage,
  recordUsage,
} from "@/lib/usage/limit";

class UploadTokenError extends Error {
  constructor(
    readonly status: 400 | 401 | 429,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "UploadTokenError";
  }
}

function requireAllowed(
  decision: ReturnType<typeof decideUploadToken>,
): void {
  if (!decision.ok) {
    throw new UploadTokenError(decision.status, decision.error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const { userId } = await auth();

        requireAllowed(
          decideUploadToken({
            userId,
            pathCheck: null,
            used: null,
            recorded: null,
          }),
        );

        const pathCheck = validateUploadPath(pathname, userId!);

        requireAllowed(
          decideUploadToken({
            userId,
            pathCheck,
            used: null,
            recorded: null,
          }),
        );

        if (!pathCheck.ok) {
          throw new UploadTokenError(400, MESSAGES.api.badRequest);
        }

        const used = await countTodayUsage(userId!, new Date());

        requireAllowed(
          decideUploadToken({
            userId,
            pathCheck,
            used,
            recorded: null,
          }),
        );

        const recorded = await recordUsage({
          id: pathCheck.uploadId,
          userId: userId!,
          kind: "document",
        });

        requireAllowed(
          decideUploadToken({ userId, pathCheck, used, recorded }),
        );

        return {
          allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: false,
        };
      },
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof UploadTokenError) {
      return Response.json(
        { error: error.publicMessage },
        { status: error.status },
      );
    }

    console.error("blob-upload", { step: "handle-upload", error });

    return Response.json(
      { error: MESSAGES.api.internal },
      { status: 500 },
    );
  }
}
