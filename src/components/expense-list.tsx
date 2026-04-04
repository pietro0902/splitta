"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Receipt, ChevronDown, Pencil, Check, X } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { deleteExpense, renameReceipt, updateExpense } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import type { Expense, Member } from "@/lib/db";

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
  members,
}: {
  expenses: Expense[];
  groupId: number;
  members: Member[];
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
          <ExpenseItem key={entry.expense.id} expense={entry.expense} groupId={groupId} members={members} index={i} />
        ) : (
          <ReceiptGroup key={entry.receiptId} expenses={entry.expenses} groupId={groupId} members={members} index={i} />
        )
      )}
    </div>
  );
}

function EditExpenseModal({
  expense,
  groupId,
  members,
  onClose,
}: {
  expense: Expense;
  groupId: number;
  members: Member[];
  onClose: () => void;
}) {
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(String(expense.amount));
  const [paidBy, setPaidBy] = useState(expense.paid_by_member_id);
  const [splitWith, setSplitWith] = useState<Set<number>>(
    new Set(expense.splits.map((s) => s.member_id))
  );
  const [isPending, startTransition] = useTransition();

  function toggleSplit(id: number) {
    const next = new Set(splitWith);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSplitWith(next);
  }

  function handleSave() {
    if (!description || !amount || !paidBy || splitWith.size === 0) return;
    startTransition(async () => {
      await updateExpense(
        expense.id,
        groupId,
        description,
        Number(amount),
        paidBy,
        Array.from(splitWith)
      );
      onClose();
    });
  }

  const splitAmount = splitWith.size > 0 && amount ? Number(amount) / splitWith.size : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Pencil className="size-5 text-primary" />
            <h2 className="font-heading text-xl font-bold">Edit Expense</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5">
          <input
            type="text"
            placeholder="What was it for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">&euro;</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-2xl font-heading font-bold tabular-nums placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Paid by</label>
            <div className="grid grid-cols-2 gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPaidBy(m.id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    paidBy === m.id
                      ? "bg-primary/10 ring-2 ring-primary text-primary"
                      : "bg-muted/50 hover:bg-muted text-foreground"
                  }`}
                >
                  <MemberAvatar name={m.name} color={m.color} size="sm" />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">Split between</label>
              {splitAmount > 0 && (
                <span className="text-xs font-medium text-primary">
                  &euro;{splitAmount.toFixed(2)} each
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => toggleSplit(m.id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    splitWith.has(m.id)
                      ? "bg-primary/10 ring-2 ring-primary text-primary"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <MemberAvatar name={m.name} color={m.color} size="sm" />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={!description || !amount || !paidBy || splitWith.size === 0 || isPending}
            className="w-full h-12 rounded-xl text-base font-semibold"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReceiptGroup({
  expenses,
  groupId,
  members,
  index,
}: {
  expenses: Expense[];
  groupId: number;
  members: Member[];
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [, startRename] = useTransition();
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const paidBy = expenses[0];
  const receiptId = expenses[0].receipt_id!;
  const receiptName = expenses[0].receipt_name;
  const date = new Date(expenses[0].created_at + "Z");
  const formattedDate = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  const displayName = receiptName || "Receipt";

  function startEditing(e: React.MouseEvent) {
    e.stopPropagation();
    setEditName(receiptName || "");
    setEditing(true);
  }

  function saveEdit(e: React.MouseEvent | React.FormEvent) {
    e.stopPropagation();
    e.preventDefault();
    setEditing(false);
    startRename(() => renameReceipt(receiptId, editName, groupId));
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <button
        onClick={() => !editing && setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
      >
        <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Receipt className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          {editing ? (
            <form onSubmit={saveEdit} className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Receipt name..."
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              />
              <button type="submit" className="p-1 rounded-lg hover:bg-primary/10 text-primary">
                <Check className="size-3.5" />
              </button>
            </form>
          ) : (
            <>
              <p className="font-medium text-sm truncate flex items-center gap-1.5">
                {displayName}
                <span className="text-muted-foreground font-normal">
                  &middot; {expenses.length} {expenses.length === 1 ? "item" : "items"}
                </span>
                <span
                  onClick={startEditing}
                  className="inline-flex p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {paidBy.paid_by_name} paid &middot; {formattedDate}
              </p>
            </>
          )}
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
                <ReceiptItemRow key={expense.id} expense={expense} groupId={groupId} members={members} />
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
  members,
}: {
  expense: Expense;
  groupId: number;
  members: Member[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editingExpense, setEditingExpense] = useState(false);

  return (
    <>
      <div className="group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/20 transition-colors">
        <button
          onClick={() => setEditingExpense(true)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm truncate">{expense.description}</p>
          <p className="text-[11px] text-muted-foreground">
            {expense.splits.length} {expense.splits.length === 1 ? "person" : "people"}
          </p>
        </button>
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
          className="sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <AnimatePresence>
        {editingExpense && (
          <EditExpenseModal
            expense={expense}
            groupId={groupId}
            members={members}
            onClose={() => setEditingExpense(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ExpenseItem({
  expense,
  groupId,
  members,
  index,
}: {
  expense: Expense;
  groupId: number;
  members: Member[];
  index: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingExpense, setEditingExpense] = useState(false);
  const date = new Date(expense.created_at + "Z");
  const formattedDate = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={() => setEditingExpense(true)}
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
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Delete this expense?")) {
              startTransition(() => deleteExpense(expense.id, groupId));
            }
          }}
          disabled={isPending}
          className="sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
        >
          <Trash2 className="size-3.5" />
        </button>
      </motion.div>
      <AnimatePresence>
        {editingExpense && (
          <EditExpenseModal
            expense={expense}
            groupId={groupId}
            members={members}
            onClose={() => setEditingExpense(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
