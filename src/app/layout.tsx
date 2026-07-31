import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// One tight grotesk for everything. Ghiaccio has no editorial voice for a
// display serif to speak in, and Instrument Serif -- the old display face --
// fought the interface rather than leading it.
//
// Loaded once. `--font-display` still exists, so `font-heading` keeps
// resolving, but it is aliased to this same family in globals.css rather than
// being a second next/font call for the identical typeface.
const sans = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

// Every figure in the app: balances, amounts, the columns of a receipt.
const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Splitta — Dividi le spese con gli amici",
  description: "Il modo più semplice per dividere le spese e chiudere i conti con il tuo gruppo.",
  // iOS ignores the manifest's `display` field: without this, adding Splitta to
  // the home screen still opens it inside Safari's chrome.
  appleWebApp: {
    capable: true,
    title: "Splitta",
    statusBarStyle: "black-translucent",
  },
};

// Tints the browser and task-switcher chrome. Split by scheme so the bar meets
// the page background rather than sitting on top of it as a seam.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1F5F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0E14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
