// Pure, client-safe helpers for tracking who paid an expense. Mirrors
// splits.ts, which does the same job for who owes what: an expense can be
// paid by several people at once, each for a different amount.

export type PayerInput = { memberId: number; amount: number };

const EPS = 0.005;

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PayerResult = {
  payers: PayerInput[];
  valid: boolean;
  assigned: number;
  remaining: number;
  error: string | null;
};

// Compute payer amounts from the editor's raw string inputs. With a single
// payer selected they're assumed to have paid the full amount, so no input
// is needed; with several, each must enter their own share and it must add
// up to the total.
export function computePayers(
  total: number,
  selectedIds: number[],
  amounts: Record<number, string>
): PayerResult {
  const base: PayerResult = { payers: [], valid: false, assigned: 0, remaining: total, error: null };
  if (!total || total <= 0) return { ...base, error: "Enter an amount first" };
  if (selectedIds.length === 0) return { ...base, error: "Pick who paid" };

  if (selectedIds.length === 1) {
    const amount = roundCents(total);
    return { ...base, payers: [{ memberId: selectedIds[0], amount }], valid: true, assigned: amount, remaining: 0 };
  }

  const payers = selectedIds
    .map((id) => ({ memberId: id, amount: roundCents(Number(amounts[id]) || 0) }))
    .filter((p) => p.amount > 0);
  const assigned = roundCents(payers.reduce((s, p) => s + p.amount, 0));
  const remaining = roundCents(total - assigned);
  const valid = Math.abs(remaining) < EPS && payers.length > 0;
  return {
    ...base,
    payers,
    valid,
    assigned,
    remaining,
    error: valid ? null : remaining > 0 ? `€${remaining.toFixed(2)} left to assign` : `€${Math.abs(remaining).toFixed(2)} over`,
  };
}

// Server-side guard, mirrors splitsAreValid.
export function payersAreValid(total: number, payers: { amount: number }[]): boolean {
  if (!payers.length) return false;
  const sum = payers.reduce((s, p) => s + p.amount, 0);
  return Math.abs(sum - total) < EPS;
}
