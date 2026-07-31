"use client";

import { todayInput } from "@/lib/dates";

// "Quando". Capped at today: an expense in the future is not a thing anybody
// splits, and allowing one would put it permanently at the top of the list.
export function DateField({
  value,
  onChange,
  label = "Quando",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </label>
      <input
        type="date"
        value={value}
        max={todayInput()}
        onChange={(e) => onChange(e.target.value)}
        className="figure w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
