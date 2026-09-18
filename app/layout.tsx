import { ClerkProvider } from "@clerk/nextjs";
import { koKR } from "@clerk/localizations";
import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SlipScan",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      localization={koKR}
      signInUrl="/sign-in"
      signInFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      <html lang="ko" className={pretendard.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
