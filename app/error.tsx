"use client";

import Link from "next/link";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/lib/messages";

export default function ErrorPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[720px] items-center px-5 py-10">
      <Panel className="w-full space-y-5 text-center">
        <p className="text-h1 text-strong">{MESSAGES.api.internal}</p>
        <Button asChild variant="secondary">
          <Link href="/dashboard">{MESSAGES.ui.dashboardLink}</Link>
        </Button>
      </Panel>
    </main>
  );
}
