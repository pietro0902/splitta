"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Receipt, ChevronDown } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { deleteExpense } from "@/lib/actions";
import type { Expense } from "@/lib/db";

type ExpenseEntry =
  | { type: "single"; expense: Expense }
  | { type: "receipt"; receiptId: string; expenses: Expense[] };

function groupExpenses(expenses: Expense[]): ExpenseEntry[] {
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

  // Sort by most recent item in each entry
  entries.sort((a, b) => {
    const dateA = a.type === "single" ? a.expense.created_at : a.expenses[0].created_at;
    const dateB = b.type === "single" ? b.expense.created_at : b.expenses[0].created_at;
    return dateB.localeCompare(dateA);
  });

  return entries;
}

export function ExpenseList({
  expenses,
  groupId,
}: {
  expenses: Expense[];
  groupId: number;
}) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-4xl mb-3">📝</p>
        <p className="font-medium">No expenses yet</p>
        <p className="text-sm mt-1">Add your first expense to get started</p>
      </div>
    );
  }

  const entries = groupExpenses(expenses);

  return (
    <div className="space-y-2">
      {entries.map((entry, i) =>
        entry.type === "single" ? (
          <ExpenseItem key={entry.expense.id} expense={entry.expense} groupId={groupId} index={i} />
        ) : (
          <ReceiptGroup key={entry.receiptId} expenses={entry.expenses} groupId={groupId} index={i} />
        )
      )}
    </div>
  );
}

function ReceiptGroup({
  expenses,
  groupId,
  index,
}: {
  expenses: Expense[];
  groupId: number;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const paidBy = expenses[0];
  const date = new Date(expenses[0].created_at + "Z");
  const formattedDate = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
      >
        <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Receipt className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="font-medium text-sm truncate">
            Receipt &middot; {expenses.length} {expenses.length === 1 ? "item" : "items"}
          </p>
          <p className="text-xs text-muted-foreground">
            {paidBy.paid_by_name} paid &middot; {formattedDate}
          </p>
        </div>
        <div className="text-right shrink-0 mr-1">
          <p className="font-heading font-bold tabular-nums">&euro;{total.toFixed(2)}</p>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-3 py-2 space-y-1">
              {expenses.map((expense) => (
                <ReceiptItemRow key={expense.id} expense={expense} groupId={groupId} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ReceiptItemRow({
  expense,
  groupId,
}: {
  expense: Expense;
  groupId: number;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/20 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{expense.description}</p>
        <p className="text-[11px] text-muted-foreground">
          {expense.splits.length} {expense.splits.length === 1 ? "person" : "people"}
        </p>
      </div>
      <p className="font-medium text-sm tabular-nums shrink-0">
        &euro;{expense.amount.toFixed(2)}
      </p>
      <button
        onClick={() => {
          if (confirm("Delete this item?")) {
            startTransition(() => deleteExpense(expense.id, groupId));
          }
        }}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

function ExpenseItem({
  expense,
  groupId,
  index,
}: {
  expense: Expense;
  groupId: number;
  index: number;
}) {
  const [isPending, startTransition] = useTransition();
  const date = new Date(expense.created_at + "Z");
  const formattedDate = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/30 transition-colors"
    >
      <MemberAvatar name={expense.paid_by_name} color={expense.paid_by_color} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{expense.description}</p>
        <p className="text-xs text-muted-foreground">
          {expense.paid_by_name} paid &middot; {formattedDate}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-heading font-bold tabular-nums">&euro;{expense.amount.toFixed(2)}</p>
        <p className="text-[11px] text-muted-foreground">
          {expense.splits.length} {expense.splits.length === 1 ? "person" : "people"}
        </p>
      </div>
      <button
        onClick={() => {
          if (confirm("Delete this expense?")) {
            startTransition(() => deleteExpense(expense.id, groupId));
          }
        }}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
      >
        <Trash2 className="size-3.5" />
      </button>
    </motion.div>
  );
}
