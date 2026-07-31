"use client";

import { MemberAvatar } from "@/components/member-avatar";
import type { PayerResult } from "@/lib/payers";
import type { Member } from "@/lib/db-types";

// Two states in one control. One person tapped: pills, nothing else -- the
// common case stays a single tap. A second person tapped: the amount fields
// appear underneath, because now the app cannot know who covered how much.
// The second state was in the code before it was in the design; this is it
// drawn rather than invented.
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
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Ha pagato
        </label>
        {multiple && (
          <span className={`text-xs ${result.valid ? "text-positive" : "text-negative"}`}>
            {result.error ?? "torna"}
          </span>
        )}
      </div>

      <div className="no-scrollbar -mx-1 flex flex-wrap gap-1.5 px-1">
        {members.map((m) => {
          const isOn = selected.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id)}
              className={`flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 text-sm transition-colors ${
                isOn
                  ? "bg-brand-field text-primary ring-1 ring-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <MemberAvatar name={m.name} color={m.color} size="sm" />
              {m.name}
            </button>
          );
        })}
      </div>

      {multiple && (
        <div className="mt-2.5 space-y-1.5">
          {members
            .filter((m) => selected.has(m.id))
            .map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                <div className="relative shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amounts[m.id] ?? ""}
                    onChange={(e) => onAmountChange(m.id, e.target.value)}
                    placeholder="0.00"
                    className="figure w-24 rounded-lg border border-border bg-background py-1.5 pl-2 pr-5 text-right text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    €
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
