import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const display = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Splitta — Split expenses with friends",
  description: "The easiest way to split expenses and settle debts with your group.",
  // iOS ignores the manifest's `display` field: without this, adding Splitta to
  // the home screen still opens it inside Safari's chrome.
  appleWebApp: {
    capable: true,
    title: "Splitta",
    statusBarStyle: "default",
  },
};

// Tints the browser and task-switcher chrome. Split by scheme because the app
// has a dark theme and the light terracotta would glare against it.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1614" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col noise-bg">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
