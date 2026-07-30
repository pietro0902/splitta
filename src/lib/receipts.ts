// Folding a scanned receipt back into one thing.
//
// A receipt is not a row. It is N expenses sharing a `receipt_id`, one per line
// item, because that is what makes each line splittable between different
// people. The consequence is that every surface which counts, dates, lists or
// ranks expenses has to fold them back together first -- otherwise one weekly
// shop reads as twelve separate dinners. In this database 167 of 268 expenses
// are receipt lines, so "first" is not an edge case, it is the common case.
//
// Pure and client-safe: used by the expense list, the group page's tab badge
// and the analytics view.
import type { Expense, ExpensePayer } from "./db-types";

export type ExpenseEntry =
  | { type: "single"; expense: Expense }
  | { type: "receipt"; receiptId: string; expenses: Expense[] };

// When the receipt happened, which is its *earliest* line -- not its latest.
// `getExpenses` returns rows newest-first, so reading `expenses[0]` (as this
// used to) dated a receipt by whichever line was touched last: editing a July
// receipt to add a forgotten item re-dated the whole thing to today and jumped
// it to the top of the list.
export function receiptDate(expenses: Expense[]): string {
  return expenses.reduce((min, e) => (e.created_at < min ? e.created_at : min), expenses[0].created_at);
}

// Everyone who put money into this receipt, with what they paid across all of
// its lines. `distributePayersOverLines` spreads each payer's total over the
// items, so any single line may name only one of them -- summarising the
// receipt from `expenses[0].payers` (as this used to) silently credits the
// whole shop to whoever happened to cover the first item.
export function receiptPayers(expenses: Expense[]): ExpensePayer[] {
  const byMember = new Map<number, ExpensePayer>();
  for (const expense of expenses) {
    for (const payer of expense.payers) {
      const seen = byMember.get(payer.member_id);
      if (seen) seen.amount_cents += payer.amount_cents;
      else byMember.set(payer.member_id, { ...payer });
    }
  }
  return Array.from(byMember.values()).sort((a, b) => b.amount_cents - a.amount_cents);
}

export function groupExpenses(expenses: Expense[]): ExpenseEntry[] {
  const entries: ExpenseEntry[] = [];
  const receiptMap = new Map<string, Expense[]>();

  for (const expense of expenses) {
    if (expense.receipt_id) {
      const arr = receiptMap.get(expense.receipt_id) || [];
      arr.push(expense);
      receiptMap.set(expense.receipt_id, arr);
    } else {
      entries.push({ type: "single", expense });
    }
  }

  for (const [receiptId, exps] of receiptMap) {
    entries.push({ type: "receipt", receiptId, expenses: exps });
  }

  entries.sort((a, b) => entryDate(b).localeCompare(entryDate(a)));
  return entries;
}

export function entryDate(entry: ExpenseEntry): string {
  return entry.type === "single" ? entry.expense.created_at : receiptDate(entry.expenses);
}

export function entryAmountCents(entry: ExpenseEntry): number {
  return entry.type === "single"
    ? entry.expense.amount_cents
    : entry.expenses.reduce((s, e) => s + e.amount_cents, 0);
}

// What the expense list actually shows, which is what the tab badge should
// count. `expenses.length` counts rows: this group's badge read 268 while the
// list below it rendered 123 things.
export function countExpenseEntries(expenses: Expense[]): number {
  let singles = 0;
  const receipts = new Set<string>();
  for (const expense of expenses) {
    if (expense.receipt_id) receipts.add(expense.receipt_id);
    else singles++;
  }
  return singles + receipts.size;
}
