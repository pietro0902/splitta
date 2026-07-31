"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    // Ghiaccio is designed dark-first: the light theme is the counterpart, not
    // the baseline, so a visitor whose OS expresses no preference gets dark.
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
