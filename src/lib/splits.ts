// Pure, client-safe helpers for splitting an expense across members.
// Used by both the UI (live preview) and the server actions (validation),
// so it must not import anything server-only.

export type SplitMode = "equal" | "exact" | "percent" | "shares";

// One member's share of an expense. `amount` is the euros owed (source of
// truth for balances); `weight` is the raw input for the chosen mode
// (euro amount / percent / share count), or null for an equal split.
export type SplitInput = { memberId: number; amount: number; weight: number | null };

export const SPLIT_MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: "equal", label: "Equally", hint: "Same share for everyone" },
  { id: "exact", label: "Amounts", hint: "Enter exact euro amounts" },
  { id: "percent", label: "Percent", hint: "Split by percentage" },
  { id: "shares", label: "Shares", hint: "Split by parts (e.g. 2 vs 1)" },
];

const EPS = 0.005;

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SplitResult = {
  splits: SplitInput[];
  valid: boolean;
  // Euros currently assigned and what is left to reach the total (exact mode).
  assigned: number;
  remaining: number;
  // For percent mode: total percent entered and what is left to reach 100.
  percentAssigned: number;
  percentRemaining: number;
  error: string | null;
};

// Distribute `total` across entries proportionally to their weight, rounding
// each share to cents and letting the last kept entry absorb the rounding
// remainder so the parts always sum back to `total` exactly.
function distribute(
  total: number,
  entries: { memberId: number; raw: number }[]
): SplitInput[] {
  const kept = entries.filter((e) => e.raw > 0);
  const sumRaw = kept.reduce((s, e) => s + e.raw, 0);
  if (sumRaw <= 0) return [];

  let acc = 0;
  return kept.map((e, i) => {
    let amount: number;
    if (i === kept.length - 1) {
      amount = roundCents(total - acc);
    } else {
      amount = roundCents((total * e.raw) / sumRaw);
      acc += amount;
    }
    return { memberId: e.memberId, amount, weight: e.raw };
  });
}

/**
 * Compute the per-member splits for an expense.
 * @param mode      how the user chose to divide the bill
 * @param total     the expense amount in euros
 * @param memberIds the participating members, in display order
 * @param weights   raw input keyed by member id (euros / percent / shares), as numbers
 */
export function computeSplits(
  mode: SplitMode,
  total: number,
  memberIds: number[],
  weights: Record<number, number>
): SplitResult {
  const base: SplitResult = {
    splits: [],
    valid: false,
    assigned: 0,
    remaining: total,
    percentAssigned: 0,
    percentRemaining: 100,
    error: null,
  };

  if (!total || total <= 0) return { ...base, error: "Enter an amount first" };
  if (memberIds.length === 0) return { ...base, error: "Pick at least one person" };

  if (mode === "equal") {
    const splits = distribute(total, memberIds.map((id) => ({ memberId: id, raw: 1 }))).map(
      (s) => ({ ...s, weight: null })
    );
    return { ...base, splits, valid: true, assigned: total, remaining: 0 };
  }

  if (mode === "exact") {
    const splits: SplitInput[] = memberIds
      .map((id) => ({ memberId: id, amount: roundCents(weights[id] || 0), weight: roundCents(weights[id] || 0) }))
      .filter((s) => s.amount > 0);
    const assigned = roundCents(splits.reduce((s, x) => s + x.amount, 0));
    const remaining = roundCents(total - assigned);
    const valid = Math.abs(remaining) < EPS && splits.length > 0;
    return {
      ...base,
      splits,
      valid,
      assigned,
      remaining,
      error: valid ? null : remaining > 0 ? `€${remaining.toFixed(2)} left to assign` : `€${Math.abs(remaining).toFixed(2)} over`,
    };
  }

  if (mode === "percent") {
    const percentAssigned = roundCents(memberIds.reduce((s, id) => s + (weights[id] || 0), 0));
    const percentRemaining = roundCents(100 - percentAssigned);
    const valid = Math.abs(percentRemaining) < 0.05;
    const splits = valid
      ? distribute(total, memberIds.map((id) => ({ memberId: id, raw: weights[id] || 0 })))
      : [];
    return {
      ...base,
      splits,
      valid,
      percentAssigned,
      percentRemaining,
      error: valid ? null : percentRemaining > 0 ? `${percentRemaining.toFixed(1)}% left` : `${Math.abs(percentRemaining).toFixed(1)}% over`,
    };
  }

  // shares: default 1 share each; total is split proportionally so it always balances.
  const splits = distribute(
    total,
    memberIds.map((id) => ({ memberId: id, raw: weights[id] ?? 1 }))
  );
  const valid = splits.length > 0;
  return { ...base, splits, valid, assigned: total, remaining: 0, error: valid ? null : "Give someone at least one share" };
}

// Convert the editor's raw string inputs into the numeric weight map computeSplits
// expects. Empty/invalid entries are dropped so absent members fall back to their
// mode default (e.g. 1 share).
export function toNumericWeights(weights: Record<number, string>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(weights)) {
    if (v !== "" && Number.isFinite(Number(v))) out[Number(k)] = Number(v);
  }
  return out;
}

// Verify a set of already-computed splits sums to the total (server-side guard).
export function splitsAreValid(total: number, splits: { amount: number }[]): boolean {
  if (!splits.length) return false;
  const sum = splits.reduce((s, x) => s + x.amount, 0);
  return Math.abs(sum - total) < EPS;
}
