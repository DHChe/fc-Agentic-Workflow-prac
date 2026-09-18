import { SignIn } from "@clerk/nextjs";

import { TicketSignIn } from "@/components/auth/ticket-sign-in";

export default function SignInPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[720px] items-center justify-center px-5 py-10">
      <TicketSignIn />
      <SignIn fallbackRedirectUrl="/dashboard" withSignUp={false} />
    </main>
  );
}
