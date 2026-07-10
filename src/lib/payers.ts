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

// A receipt's payers are entered once for the whole bill, but each line item
// is stored as its own expense, so every payer's total has to be spread across
// the lines. Splitting each line independently lets rounding drift accumulate
// (three €27 lines paid 40/40/1 reopen as 39.99/39.99/1.02). This spreads all
// payers across all lines at once, in integer cents, so BOTH invariants hold
// exactly: every line's payer amounts sum to that line's price, and every
// payer's amounts across lines sum back to the total they entered.
export function distributePayersOverLines(payers: PayerInput[], lineTotals: number[]): PayerInput[][] {
  const remPayer = payers.map((p) => Math.round(p.amount * 100));
  const lineCents = lineTotals.map((t) => Math.round(t * 100));
  let remTotal = remPayer.reduce((a, b) => a + b, 0);

  // Keep the margins consistent: if the lines don't sum to the payer total
  // (float noise), nudge the last line so the two grand totals match.
  const lineSum = lineCents.reduce((a, b) => a + b, 0);
  if (lineCents.length > 0 && lineSum !== remTotal) {
    lineCents[lineCents.length - 1] += remTotal - lineSum;
  }

  return lineCents.map((need, i) => {
    const isLast = i === lineCents.length - 1;
    let alloc: number[];
    if (isLast) {
      // Whatever each payer still owes lands here; guarantees exact column sums.
      alloc = [...remPayer];
    } else {
      const ideal = remPayer.map((rp) => (remTotal > 0 ? (need * rp) / remTotal : 0));
      alloc = ideal.map((x) => Math.floor(x));
      let leftover = need - alloc.reduce((a, b) => a + b, 0);
      const byFrac = ideal
        .map((x, idx) => ({ idx, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac);
      for (const { idx } of byFrac) {
        if (leftover <= 0) break;
        if (alloc[idx] < remPayer[idx]) {
          alloc[idx]++;
          leftover--;
        }
      }
    }
    alloc.forEach((c, idx) => (remPayer[idx] -= c));
    remTotal -= need;
    return payers
      .map((p, idx) => ({ memberId: p.memberId, amount: alloc[idx] / 100 }))
      .filter((p) => p.amount > 0);
  });
}
