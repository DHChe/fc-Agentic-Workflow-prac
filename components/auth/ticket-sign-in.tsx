"use client";

import { useSignIn } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export function TicketSignIn(): null {
  const { fetchStatus, signIn } = useSignIn();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticket = searchParams.get("__clerk_ticket");
  const attemptedTicket = useRef<string | null>(null);

  useEffect(() => {
    if (
      !ticket ||
      fetchStatus === "fetching" ||
      attemptedTicket.current === ticket
    ) {
      return;
    }

    attemptedTicket.current = ticket;

    const fail = (): void => {
      router.replace("/?demo=failed");
    };

    const consumeTicket = async (): Promise<void> => {
      try {
        const ticketResult = await signIn.ticket({ ticket });

        if (ticketResult.error || signIn.status !== "complete") {
          fail();
          return;
        }

        const finalizeResult = await signIn.finalize({
          navigate: ({ decorateUrl }) => {
            const destination = decorateUrl("/dashboard");

            if (destination.startsWith("http")) {
              window.location.assign(destination);
              return;
            }

            router.replace(destination);
          },
        });

        if (finalizeResult.error) {
          fail();
        }
      } catch {
        fail();
      }
    };

    void consumeTicket();
  }, [fetchStatus, router, signIn, ticket]);

  return null;
}
