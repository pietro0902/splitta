"use client";

import { MemberAvatar } from "@/components/member-avatar";
import { SPLIT_MODES, type SplitMode, type SplitResult } from "@/lib/splits";
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
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-muted-foreground">Split</label>
        <span className={`text-xs font-medium ${result.valid ? "text-primary" : "text-amber-500"}`}>
          {result.error ?? splitSummary(mode, result)}
        </span>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/50 p-1 mb-3">
        {SPLIT_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            title={m.hint}
            className={`rounded-lg px-1 py-1.5 text-xs font-medium transition-all ${
              mode === m.id
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Member rows */}
      <div className="space-y-1.5">
        {members.map((m) => {
          const isOn = selected.has(m.id);
          const owed = amountByMember.get(m.id) ?? 0;
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

              {isOn && mode === "equal" && (
                <span className="text-sm font-medium tabular-nums text-muted-foreground shrink-0">
                  €{owed.toFixed(2)}
                </span>
              )}

              {isOn && mode !== "equal" && (
                <div className="flex items-center gap-1 shrink-0">
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={mode === "exact" ? "0.01" : mode === "percent" ? "1" : "1"}
                      value={weights[m.id] ?? ""}
                      onChange={(e) => onWeightChange(m.id, e.target.value)}
                      placeholder={mode === "shares" ? "1" : "0"}
                      className="w-20 rounded-lg border border-border bg-background pl-2 pr-5 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      {SUFFIX[mode]}
                    </span>
                  </div>
                  {mode !== "exact" && (
                    <span className="w-14 text-right text-xs tabular-nums text-muted-foreground shrink-0">
                      €{owed.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function splitSummary(mode: SplitMode, result: SplitResult): string {
  if (result.splits.length === 0) return "";
  if (mode === "equal") return `€${(result.splits[0]?.amount ?? 0).toFixed(2)} each`;
  if (mode === "percent") return "100% assigned";
  if (mode === "exact") return "Adds up ✓";
  return "Split by shares";
}
