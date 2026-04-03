"use client";

import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { deleteExpense } from "@/lib/actions";
import { useTransition } from "react";
import type { Expense } from "@/lib/db";

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

  return (
    <div className="space-y-2">
      {expenses.map((expense, i) => (
        <ExpenseItem key={expense.id} expense={expense} groupId={groupId} index={i} />
      ))}
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
