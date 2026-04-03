"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="size-9" />;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="size-9 flex items-center justify-center rounded-xl bg-card border border-border hover:bg-accent transition-colors"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
