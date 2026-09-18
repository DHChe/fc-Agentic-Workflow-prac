import { auth } from "@clerk/nextjs/server";
import { ChartPie, FileText, ScanLine } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NoticeLine } from "@/components/notice-line";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { MESSAGES } from "@/lib/messages";

const FEATURE_ICONS = [ScanLine, ChartPie, FileText] as const;

export default async function LandingPage(props: {
  searchParams: Promise<{ demo?: string }>;
}): Promise<React.JSX.Element> {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  const { demo } = await props.searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1180px] items-center px-5 py-8 md:px-6">
      <div className="w-full space-y-7">
        <div className="max-w-[760px] space-y-5">
          <h1 className="text-display text-strong">
            {MESSAGES.landing.title}
          </h1>
          <div className="flex flex-col gap-3 sm:flex-row">
            <form action="/api/demo-login" method="post">
              <Button className="w-full sm:w-auto" data-testid="demo-login" type="submit">
                {MESSAGES.label.button.demoLogin}
              </Button>
            </form>
            <Button asChild className="w-full sm:w-auto" variant="secondary">
              <Link href="/sign-in">{MESSAGES.label.button.signIn}</Link>
            </Button>
          </div>
          {demo === "failed" ? (
            <NoticeLine tone="error">
              {MESSAGES.api.demoLoginFailed}
            </NoticeLine>
          ) : null}
        </div>

        <Panel className="grid gap-5 md:grid-cols-3">
          {MESSAGES.landing.features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index];

            return (
              <article className="flex gap-3" key={feature.title}>
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  strokeWidth={2}
                />
                <div className="space-y-1">
                  <h2 className="text-h3 text-strong">{feature.title}</h2>
                  <p className="text-body text-muted-foreground">
                    {feature.body}
                  </p>
                </div>
              </article>
            );
          })}
        </Panel>

        <div className="space-y-1 text-caption text-muted-foreground">
          <p>{MESSAGES.landing.notice1}</p>
          <p>{MESSAGES.landing.notice2}</p>
        </div>
      </div>
    </main>
  );
}
