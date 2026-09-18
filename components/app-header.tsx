import Link from "next/link";
import type * as React from "react";

import { MESSAGES } from "@/lib/messages";

export function AppHeader(props: {
  usage?: React.ReactNode;
  userMenu: React.ReactNode;
}): React.JSX.Element {
  return (
    <header className="h-14 border-b border-border bg-card">
      <div className="mx-auto flex h-full w-full max-w-[1180px] items-center justify-between gap-4 px-5 md:px-6">
        <Link
          className="flex items-center gap-2 whitespace-nowrap font-semibold tracking-[-0.02em] text-strong"
          href="/dashboard"
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-primary"
          />
          {MESSAGES.ui.brand}
        </Link>
        <div className="flex items-center gap-4">
          {props.usage}
          {props.userMenu}
        </div>
      </div>
    </header>
  );
}
