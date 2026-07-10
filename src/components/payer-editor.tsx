"use client";

import { MemberAvatar } from "@/components/member-avatar";
import type { PayerResult } from "@/lib/payers";
import type { Member } from "@/lib/db-types";

export function PayerEditor({
  members,
  selected,
  onToggle,
  amounts,
  onAmountChange,
  result,
}: {
  members: Member[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  amounts: Record<number, string>;
  onAmountChange: (id: number, value: string) => void;
  result: PayerResult;
}) {
  const multiple = selected.size > 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-muted-foreground">Paid by</label>
        {multiple && (
          <span className={`text-xs font-medium ${result.valid ? "text-primary" : "text-amber-500"}`}>
            {result.error ?? "Adds up ✓"}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {members.map((m) => {
          const isOn = selected.has(m.id);
          return (
            <div
              key={m.id}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-all ${
                isOn ? "bg-primary/5 ring-1 ring-primary/30" : "bg-muted/40"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(m.id)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <MemberAvatar name={m.name} color={m.color} size="sm" />
                <span className={`truncate text-sm font-medium ${isOn ? "text-foreground" : "text-muted-foreground"}`}>
                  {m.name}
                </span>
              </button>

              {isOn && multiple && (
                <div className="relative shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amounts[m.id] ?? ""}
                    onChange={(e) => onAmountChange(m.id, e.target.value)}
                    placeholder="0.00"
                    className="w-20 rounded-lg border border-border bg-background pl-2 pr-5 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    €
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
