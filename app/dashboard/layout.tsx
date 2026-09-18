import { SignOutButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type * as React from "react";

import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/lib/messages";

export default async function DashboardLayout(props: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const { userId } = await auth();
  const demoUserId = process.env.DEMO_USER_ID?.trim();
  const isDemoUser = Boolean(demoUserId && userId === demoUserId);

  const userMenu = isDemoUser ? (
    <SignOutButton signOutOptions={{ redirectUrl: "/" }}>
      <Button data-testid="sign-out" size="sm" variant="secondary">
        {MESSAGES.label.button.signOut}
      </Button>
    </SignOutButton>
  ) : (
    <UserButton />
  );

  return (
    <>
      <AppHeader userMenu={userMenu} />
      <main className="mx-auto w-full max-w-[1180px] px-5 py-7 md:px-6">
        {props.children}
      </main>
    </>
  );
}
