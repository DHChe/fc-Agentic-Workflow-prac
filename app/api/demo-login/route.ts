import { clerkClient } from "@clerk/nextjs/server";

function redirect(request: Request, path: string): Response {
  return Response.redirect(new URL(path, request.url), 303);
}

function getExternalStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  const demoUserId = process.env.DEMO_USER_ID?.trim();

  if (!demoUserId) {
    return redirect(request, "/?demo=failed");
  }

  try {
    const client = await clerkClient();
    const signInToken = await client.signInTokens.createSignInToken({
      userId: demoUserId,
      expiresInSeconds: 60,
    });
    const signInUrl = new URL("/sign-in", request.url);

    signInUrl.searchParams.set("__clerk_ticket", signInToken.token);

    return Response.redirect(signInUrl, 303);
  } catch (error) {
    console.error("demo-login", {
      step: "create-sign-in-token",
      externalStatus: getExternalStatus(error),
    });

    return redirect(request, "/?demo=failed");
  }
}
