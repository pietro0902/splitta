// Pure, client-safe helpers for splitting an expense across members.
// Used by both the UI (live preview) and the server actions (validation),
// so it must not import anything server-only.
//
// Every amount here is an integer number of cents. This module always did its
// arithmetic in cents internally and converted back to euros at the edges; now
// that the database stores cents too (migration 0012) the conversion is gone,
// and with it the epsilon comparisons that existed only to paper over float
// equality. "Does this add up?" is `===` again.

import { formatMoney, parseMoney } from "./money";

export type SplitMode = "equal" | "exact" | "percent" | "shares";

// One member's share of an expense. `amount` is the cents owed (source of
// truth for balances); `weight` is the raw input for the chosen mode -- cents
// for 'exact', a percentage for 'percent', a share count for 'shares' -- or
// null for an equal split.
export type SplitInput = { memberId: number; amount: number; weight: number | null };

export const SPLIT_MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: "equal", label: "Equamente", hint: "Stessa quota per tutti" },
  { id: "exact", label: "Importi", hint: "Importi esatti in euro" },
  { id: "percent", label: "%", hint: "Dividi in percentuale" },
  { id: "shares", label: "Quote", hint: "Dividi in parti (es. 2 contro 1)" },
];

// Percentages are still floats -- they are not money -- so comparing them to
// 100 needs a tolerance. Half a tenth of a percent is well below anything the
// input lets a user express.
const PERCENT_EPS = 0.05;

export type SplitResult = {
  splits: SplitInput[];
  valid: boolean;
  // Cents currently assigned and what is left to reach the total (exact mode).
  assigned: number;
  remaining: number;
  // For percent mode: total percent entered and what is left to reach 100.
  percentAssigned: number;
  percentRemaining: number;
  error: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Distribute `totalCents` across entries proportionally to their weight using
// the largest-remainder method (like distributePayersOverLines in payers.ts):
// floor every share, then hand the leftover cents out one each to whoever was
// rounded down the most. This keeps every part within a cent of its fair share
// AND makes the parts sum back to the total exactly, instead of dumping all the
// odd cents on the last person.
//
// When several entries are tied (e.g. an equal split of €10 across 3), the
// leftover would always land on the same index. To avoid one person eating the
// rounding on every equal bill, ties are resolved from a starting offset that
// rotates with the amount, so the odd cent moves around across expenses.
function distribute(
  totalCents: number,
  entries: { memberId: number; raw: number }[]
): SplitInput[] {
  const kept = entries.filter((e) => e.raw > 0);
  const sumRaw = kept.reduce((s, e) => s + e.raw, 0);
  if (sumRaw <= 0) return [];

  const parts = kept.map((e) => {
    const exact = (totalCents * e.raw) / sumRaw;
    const base = Math.floor(exact);
    return { memberId: e.memberId, raw: e.raw, cents: base, frac: exact - base };
  });

  const n = parts.length;
  const leftover = totalCents - parts.reduce((s, p) => s + p.cents, 0);
  const rot = (((totalCents % n) + n) % n);
  const order = parts
    .map((p, i) => ({ i, frac: p.frac }))
    // Biggest fractional remainder first; ties broken by a rotating index so
    // the extra cent is not always given to the same (e.g. first) person.
    .sort((a, b) => b.frac - a.frac || ((a.i - rot + n) % n) - ((b.i - rot + n) % n));
  for (let k = 0; k < leftover; k++) parts[order[k].i].cents += 1;

  return parts.map((p) => ({ memberId: p.memberId, amount: p.cents, weight: p.raw }));
}

/**
 * Compute the per-member splits for an expense.
 * @param mode       how the user chose to divide the bill
 * @param totalCents the expense amount, in cents
 * @param memberIds  the participating members, in display order
 * @param weights    raw input keyed by member id (cents / percent / shares)
 */
export function computeSplits(
  mode: SplitMode,
  totalCents: number,
  memberIds: number[],
  weights: Record<number, number>
): SplitResult {
  const base: SplitResult = {
    splits: [],
    valid: false,
    assigned: 0,
    remaining: totalCents,
    percentAssigned: 0,
    percentRemaining: 100,
    error: null,
  };

  if (!totalCents || totalCents <= 0) return { ...base, error: "Inserisci prima un importo" };
  if (memberIds.length === 0) return { ...base, error: "Scegli almeno una persona" };

  if (mode === "equal") {
    const splits = distribute(totalCents, memberIds.map((id) => ({ memberId: id, raw: 1 }))).map(
      (s) => ({ ...s, weight: null })
    );
    return { ...base, splits, valid: true, assigned: totalCents, remaining: 0 };
  }

  if (mode === "exact") {
    const splits: SplitInput[] = memberIds
      .map((id) => ({ memberId: id, amount: weights[id] || 0, weight: weights[id] || 0 }))
      .filter((s) => s.amount > 0);
    const assigned = splits.reduce((s, x) => s + x.amount, 0);
    const remaining = totalCents - assigned;
    const valid = remaining === 0 && splits.length > 0;
    return {
      ...base,
      splits,
      valid,
      assigned,
      remaining,
      error: valid
        ? null
        : remaining > 0
          ? `restano ${formatMoney(remaining)}`
          : `${formatMoney(-remaining)} di troppo`,
    };
  }

  if (mode === "percent") {
    const percentAssigned = round2(memberIds.reduce((s, id) => s + (weights[id] || 0), 0));
    const percentRemaining = round2(100 - percentAssigned);
    const valid = Math.abs(percentRemaining) < PERCENT_EPS;
    const splits = valid
      ? distribute(totalCents, memberIds.map((id) => ({ memberId: id, raw: weights[id] || 0 })))
      : [];
    return {
      ...base,
      splits,
      valid,
      percentAssigned,
      percentRemaining,
      error: valid
        ? null
        : percentRemaining > 0
          ? `manca ${percentRemaining.toFixed(1)}%`
          : `${Math.abs(percentRemaining).toFixed(1)}% di troppo`,
    };
  }

  // shares: default 1 share each; total is split proportionally so it always balances.
  const splits = distribute(
    totalCents,
    memberIds.map((id) => ({ memberId: id, raw: weights[id] ?? 1 }))
  );
  const valid = splits.length > 0;
  return { ...base, splits, valid, assigned: totalCents, remaining: 0, error: valid ? null : "Dai almeno una quota a qualcuno" };
}

// Convert the editor's raw string inputs into the numeric weight map
// computeSplits expects. Needs the mode because only 'exact' weights are money:
// those become cents, while a percentage or a share count is just the number
// typed. Empty/invalid entries are dropped so absent members fall back to their
// mode default (e.g. 1 share).
export function toNumericWeights(
  weights: Record<number, string>,
  mode: SplitMode
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(weights)) {
    if (v === "") continue;
    const parsed = mode === "exact" ? parseMoney(v) : Number.isFinite(Number(v)) ? Number(v) : null;
    if (parsed !== null) out[Number(k)] = parsed;
  }
  return out;
}

// Verify a set of already-computed splits sums to the total (server-side guard).
// Exact, now that both sides are integers.
export function splitsAreValid(totalCents: number, splits: { amount: number }[]): boolean {
  if (!splits.length) return false;
  return splits.reduce((s, x) => s + x.amount, 0) === totalCents;
}
