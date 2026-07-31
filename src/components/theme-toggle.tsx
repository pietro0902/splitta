"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

// Which icon shows is decided by CSS from the `dark` class next-themes puts on
// <html>, not by React state. The previous version flipped a `mounted` flag in
// an effect purely to dodge a hydration mismatch, which cost a cascading render
// on every page and tripped react-hooks/set-state-in-effect. Reading the class
// on click is also more truthful than `theme`: it is the value actually applied,
// so "system" resolves correctly instead of toggling to whatever it already was.
export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <button
      onClick={() =>
        setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")
      }
      aria-label="Cambia tema"
      className="flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </button>
  );
}
