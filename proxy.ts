import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { MESSAGES } from "@/lib/messages";

const isProtectedPage = createRouteMatcher(["/dashboard(.*)"]);
const isPublicApi = createRouteMatcher(["/api/demo-login"]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  if (isApiRoute(req) && !isPublicApi(req) && !userId) {
    return NextResponse.json(
      { error: MESSAGES.api.unauthorized },
      { status: 401 },
    );
  }

  if (isProtectedPage(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
