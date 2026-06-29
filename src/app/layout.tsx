import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeLoader } from "@/components/theme-loader";
import { Toaster } from "@/components/ui/sonner";
import {
  FONT_COOKIE_NAME,
  getGoogleFontParam,
  googleFontUrl,
  resolveSafeFont,
} from "@/lib/theme";
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
  // Read the font cookie in the root layout so custom Google Fonts
  // are linked in the server-rendered head.
  const cookieStore = await cookies();
  const safeFont = resolveSafeFont(cookieStore.get(FONT_COOKIE_NAME)?.value);
  const fontParam = safeFont ? getGoogleFontParam(safeFont) : undefined;
  const fontStyle = safeFont
    ? `:root { --font-sans: "${safeFont}", system-ui, sans-serif; } body { font-family: var(--font-sans); }`
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
        <ThemeLoader />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
