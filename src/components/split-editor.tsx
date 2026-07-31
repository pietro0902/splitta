"use client";

import { MemberAvatar } from "@/components/member-avatar";
import { SPLIT_MODES, type SplitMode, type SplitResult } from "@/lib/splits";
import { formatMoney } from "@/lib/money";
import type { Member } from "@/lib/db-types";

const SUFFIX: Record<Exclude<SplitMode, "equal">, string> = {
  exact: "€",
  percent: "%",
  shares: "×",
};

export function SplitEditor({
  members,
  mode,
  onModeChange,
  selected,
  onToggle,
  weights,
  onWeightChange,
  result,
}: {
  members: Member[];
  mode: SplitMode;
  onModeChange: (m: SplitMode) => void;
  selected: Set<number>;
  onToggle: (id: number) => void;
  weights: Record<number, string>;
  onWeightChange: (id: number, value: string) => void;
  result: SplitResult;
}) {
  const amountByMember = new Map(result.splits.map((s) => [s.memberId, s.amount]));

  return (
    <div>
      {/* The live per-head figure sits on the label line, where it is read
          before the split is even chosen -- "€12,15 a testa" answers the
          question people actually have. */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Diviso tra
        </label>
        <span className={`text-xs ${result.valid ? "text-muted-foreground" : "text-negative"}`}>
          {result.error ?? splitSummary(mode, result)}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-1 rounded-full bg-muted p-1">
        {SPLIT_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            title={m.hint}
            className={`rounded-full px-1 py-1.5 text-xs transition-colors ${
              mode === m.id
                ? "bg-brand-field text-primary ring-1 ring-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
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
              {isOn && mode === "equal" && (
                <span className="figure text-xs text-muted-foreground">
                  {formatMoney(amountByMember.get(m.id) ?? 0)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {mode !== "equal" && (
        <div className="mt-2.5 space-y-1.5">
          {members
            .filter((m) => selected.has(m.id))
            .map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                {mode !== "exact" && (
                  <span className="figure shrink-0 text-xs text-muted-foreground">
                    {formatMoney(amountByMember.get(m.id) ?? 0)}
                  </span>
                )}
                <div className="relative shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={mode === "exact" ? "0.01" : "1"}
                    value={weights[m.id] ?? ""}
                    onChange={(e) => onWeightChange(m.id, e.target.value)}
                    placeholder={mode === "shares" ? "1" : "0"}
                    className="figure w-24 rounded-lg border border-border bg-background py-1.5 pl-2 pr-5 text-right text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {SUFFIX[mode]}
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function splitSummary(mode: SplitMode, result: SplitResult): string {
  if (result.splits.length === 0) return "";
  if (mode === "equal") return `${formatMoney(result.splits[0]?.amount ?? 0)} a testa`;
  if (mode === "percent") return "100% assegnato";
  if (mode === "exact") return "torna";
  return "diviso in quote";
}
