import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import { ThemeLoader } from "@/components/theme-loader";
import { Toaster } from "@/components/ui/sonner";
import {
  FONT_COOKIE_NAME,
  GOOGLE_FONT_PARAMS,
  googleFontUrl,
} from "@/lib/fonts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rapid Rollout - Scoping Workbook",
  description: "TUC Rapid Rollout Scoping & Pricing Tool",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Phase 2.8 — if the user picked a custom Google Font, the
  // theme page writes its name into a cookie alongside the
  // existing localStorage entry. Read it here so we can emit a
  // <link rel="stylesheet"> in the server-rendered <head>,
  // eliminating the FOUT that ThemeLoader used to cause when it
  // appended the link post-hydration.
  const cookieStore = await cookies();
  const savedFont = cookieStore.get(FONT_COOKIE_NAME)?.value;
  const fontParam =
    savedFont && savedFont !== "default"
      ? GOOGLE_FONT_PARAMS[savedFont]
      : undefined;
  const fontStyle =
    savedFont && savedFont !== "default"
      ? `:root { --font-sans: "${savedFont}", system-ui, sans-serif; } body { font-family: var(--font-sans); }`
      : undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {fontParam && (
          <>
            <link
              rel="preconnect"
              href="https://fonts.googleapis.com"
            />
            <link
              rel="preconnect"
              href="https://fonts.gstatic.com"
              crossOrigin="anonymous"
            />
            <link rel="stylesheet" href={googleFontUrl(fontParam)} />
          </>
        )}
        {fontStyle && (
          <style dangerouslySetInnerHTML={{ __html: fontStyle }} />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          <ThemeLoader />
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
