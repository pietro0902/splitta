// Money, everywhere, as an integer number of cents.
//
// Amounts used to be stored and summed as SQLite REAL. That was survivable
// while the sums were small -- the split arithmetic already worked in cents and
// rounded correctly, so no balance was actually wrong -- but it left the
// database holding values that cannot represent 0.10 exactly, and getBalances
// adding thousands of them before rounding once at the end. The error only has
// to reach half a cent for a group's balances to stop closing, and the cost of
// converting grows with every row written. So: integers in the database,
// integers through the domain, euros only in what the user reads and types.
//
// Pure and client-safe: imported by both components and server actions.

export const CURRENCY = "€";

// "€12.34". The display form everywhere an amount is shown.
export function formatMoney(cents: number): string {
  return CURRENCY + formatAmount(cents);
}

// "12.34" -- no symbol, for form fields and chart tick labels.
export function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Parse what a user typed into cents. Accepts both decimal separators: the
// number inputs produce "12.34", but a pasted or keyboard-switched "12,34" is
// the same amount to anyone typing in Italian, and silently reading it as 1234
// euros would be a lot worse than accepting it.
//
// Returns null for anything that isn't a finite number, so callers can tell
// "empty or malformed" from a real zero.
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = typeof input === "number" ? String(input) : input.trim().replace(",", ".");
  if (raw === "") return null;
  const euros = Number(raw);
  if (!Number.isFinite(euros)) return null;
  return Math.round(euros * 100);
}

// For values that are already numeric euros (an OCR'd receipt price, a legacy
// payload) rather than user text.
export function toCents(euros: number): number {
  return Math.round(euros * 100);
}
