"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Receipt, ChevronDown, Pencil, X, Plus } from "lucide-react";
import { MemberAvatar, MemberAvatarStack } from "@/components/member-avatar";
import { deleteExpense, updateExpense, saveReceipt } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { SplitEditor } from "@/components/split-editor";
import { PayerEditor } from "@/components/payer-editor";
import { computeSplits, toNumericWeights, roundCents, SPLIT_MODES, type SplitMode } from "@/lib/splits";
import { computePayers } from "@/lib/payers";
import { EXPENSE_CATEGORIES } from "@/lib/db-types";
import type { Expense, ExpensePayer, Member } from "@/lib/db-types";

function getCategoryInfo(categoryId: string | null) {
  if (!categoryId) return null;
  return EXPENSE_CATEGORIES.find((c) => c.id === categoryId) ?? null;
}

function payerSummary(payers: ExpensePayer[]): string {
  return payers.map((p) => p.member_name).join(" & ");
}

function initialSplitMode(expense: Expense): SplitMode {
  return (SPLIT_MODES.some((m) => m.id === expense.split_mode) ? expense.split_mode : "equal") as SplitMode;
}

// Restore the editor's raw inputs from a saved expense so editing reopens with
// the same numbers the user typed. Falls back to deriving from owed amounts for
// rows saved before weights were stored.
function initialSplitWeights(expense: Expense, mode: SplitMode): Record<number, string> {
  if (mode === "equal") return {};
  const weights: Record<number, string> = {};
  for (const s of expense.splits) {
    if (mode === "exact") {
      weights[s.member_id] = String(s.weight ?? roundCents(s.amount));
    } else if (mode === "percent") {
      weights[s.member_id] = String(s.weight ?? (expense.amount > 0 ? roundCents((s.amount / expense.amount) * 100) : 0));
    } else {
      weights[s.member_id] = String(s.weight ?? 1);
    }
  }
  return weights;
}

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
  const [paidBy, setPaidBy] = useState<Set<number>>(new Set(expense.payers.map((p) => p.member_id)));
  const [paidAmounts, setPaidAmounts] = useState<Record<number, string>>(
    Object.fromEntries(expense.payers.map((p) => [p.member_id, String(p.amount)]))
  );
  const initialMode = initialSplitMode(expense);
  const [splitMode, setSplitMode] = useState<SplitMode>(initialMode);
  const [splitWith, setSplitWith] = useState<Set<number>>(
    new Set(expense.splits.map((s) => s.member_id))
  );
  const [splitWeights, setSplitWeights] = useState<Record<number, string>>(
    initialSplitWeights(expense, initialMode)
  );
  const [category, setCategory] = useState(expense.category || "");
  const [isPending, startTransition] = useTransition();

  const participantIds = members.filter((m) => splitWith.has(m.id)).map((m) => m.id);
  const splitResult = computeSplits(splitMode, Number(amount) || 0, participantIds, toNumericWeights(splitWeights));
  const payerResult = computePayers(Number(amount) || 0, Array.from(paidBy), paidAmounts);

  function toggleSplit(id: number) {
    const next = new Set(splitWith);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSplitWith(next);
  }

  function togglePayer(id: number) {
    const next = new Set(paidBy);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPaidBy(next);
  }

  function handleSave() {
    if (!description || !amount || !payerResult.valid || !splitResult.valid) return;
    startTransition(async () => {
      await updateExpense(
        expense.id,
        groupId,
        description,
        Number(amount),
        payerResult.payers,
        splitResult.splits,
        splitMode,
        category || undefined
      );
      onClose();
    });
  }

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
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(category === cat.id ? "" : cat.id)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                    category === cat.id
                      ? "bg-primary/10 ring-2 ring-primary text-primary"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <PayerEditor
            members={members}
            selected={paidBy}
            onToggle={togglePayer}
            amounts={paidAmounts}
            onAmountChange={(id, value) => setPaidAmounts((a) => ({ ...a, [id]: value }))}
            result={payerResult}
          />

          <SplitEditor
            members={members}
            mode={splitMode}
            onModeChange={setSplitMode}
            selected={splitWith}
            onToggle={toggleSplit}
            weights={splitWeights}
            onWeightChange={(id, value) => setSplitWeights((w) => ({ ...w, [id]: value }))}
            result={splitResult}
          />

          <Button
            onClick={handleSave}
            disabled={!description || !amount || !payerResult.valid || !splitResult.valid || isPending}
            className="w-full h-12 rounded-xl text-base font-semibold"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

type ReceiptLine = {
  id?: number;
  name: string;
  price: string;
  splitMemberIds: Set<number>;
  category?: string;
};

function EditReceiptModal({
  expenses,
  groupId,
  members,
  onClose,
}: {
  expenses: Expense[];
  groupId: number;
  members: Member[];
  onClose: () => void;
}) {
  const receiptId = expenses[0].receipt_id!;
  const originalIds = expenses.map((e) => e.id);
  const [receiptName, setReceiptName] = useState(expenses[0].receipt_name ?? "");
  const receiptPayerTotals = new Map<number, number>();
  for (const e of expenses) {
    for (const p of e.payers) {
      receiptPayerTotals.set(p.member_id, (receiptPayerTotals.get(p.member_id) ?? 0) + p.amount);
    }
  }
  const [paidBy, setPaidBy] = useState<Set<number>>(new Set(receiptPayerTotals.keys()));
  const [paidAmounts, setPaidAmounts] = useState<Record<number, string>>(
    Object.fromEntries(Array.from(receiptPayerTotals.entries()).map(([id, amt]) => [id, String(roundCents(amt))]))
  );
  const [lines, setLines] = useState<ReceiptLine[]>(() =>
    expenses.map((e) => ({
      id: e.id,
      name: e.description,
      price: String(e.amount),
      splitMemberIds: new Set(e.splits.map((s) => s.member_id)),
      category: e.category ?? undefined,
    }))
  );
  const [isPending, startTransition] = useTransition();

  function updateLine(index: number, field: "name" | "price", value: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function toggleLineSplit(index: number, memberId: number) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = new Set(l.splitMemberIds);
        if (next.has(memberId)) next.delete(memberId);
        else next.add(memberId);
        return { ...l, splitMemberIds: next };
      })
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { name: "", price: "", splitMemberIds: new Set(members.map((m) => m.id)) },
    ]);
  }

  const total = lines.reduce((s, l) => s + (Number(l.price) || 0), 0);
  const payerResult = computePayers(total, Array.from(paidBy), paidAmounts);
  const canSave =
    payerResult.valid &&
    lines.some((l) => l.name.trim() && Number(l.price) > 0 && l.splitMemberIds.size > 0);

  function togglePayer(id: number) {
    const next = new Set(paidBy);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPaidBy(next);
  }

  function handleSave() {
    if (!canSave) return;
    startTransition(async () => {
      await saveReceipt(
        groupId,
        receiptId,
        receiptName,
        payerResult.payers,
        lines.map((l) => ({
          id: l.id,
          name: l.name,
          price: Number(l.price) || 0,
          splitMemberIds: Array.from(l.splitMemberIds),
          category: l.category,
        })),
        originalIds
      );
      onClose();
    });
  }

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
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            <h2 className="font-heading text-xl font-bold">Edit Receipt</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Receipt name */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Receipt name</label>
            <input
              type="text"
              value={receiptName}
              onChange={(e) => setReceiptName(e.target.value)}
              placeholder="e.g. Grocery store, Dinner..."
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
          </div>

          {/* Paid by */}
          <PayerEditor
            members={members}
            selected={paidBy}
            onToggle={togglePayer}
            amounts={paidAmounts}
            onAmountChange={(id, value) => setPaidAmounts((a) => ({ ...a, [id]: value }))}
            result={payerResult}
          />

          {/* Items */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Items ({lines.length})
            </label>
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={line.id ?? `new-${idx}`} className="rounded-xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      value={line.name}
                      placeholder="Item"
                      onChange={(e) => updateLine(idx, "name", e.target.value)}
                      className="flex-1 min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                    <div className="relative shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                        &euro;
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.price}
                        placeholder="0.00"
                        onChange={(e) => updateLine(idx, "price", e.target.value)}
                        className="w-24 rounded-lg border border-border bg-card pl-7 pr-2 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                      />
                    </div>
                    <button
                      onClick={() => removeLine(idx)}
                      className="text-muted-foreground hover:text-destructive p-1.5 shrink-0"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Split selection per item — single scrollable row on mobile */}
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => toggleLineSplit(idx, m.id)}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all shrink-0 whitespace-nowrap ${
                          line.splitMemberIds.has(m.id)
                            ? "bg-primary/10 ring-1 ring-primary text-primary"
                            : "bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        <MemberAvatar name={m.name} color={m.color} size="sm" />
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addLine}
              className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all"
            >
              <Plus className="size-4" />
              Add item
            </button>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-sm font-medium text-muted-foreground">Total</span>
            <span className="text-lg font-heading font-bold tabular-nums">&euro;{total.toFixed(2)}</span>
          </div>

          <Button
            onClick={handleSave}
            disabled={!canSave || isPending}
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
  const [editingReceipt, setEditingReceipt] = useState(false);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const payerLabel = payerSummary(expenses[0].payers);
  const receiptName = expenses[0].receipt_name;
  const date = new Date(expenses[0].created_at + "Z");
  const formattedDate = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  const displayName = receiptName || "Receipt";

  function openEditor(e: React.MouseEvent) {
    e.stopPropagation();
    setEditingReceipt(true);
  }

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
          <p className="font-medium text-sm truncate flex items-center gap-1.5">
            {displayName}
            <span className="text-muted-foreground font-normal">
              &middot; {expenses.length} {expenses.length === 1 ? "item" : "items"}
            </span>
            <span
              onClick={openEditor}
              className="inline-flex p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3" />
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {payerLabel} paid &middot; {formattedDate}
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
                <ReceiptItemRow key={expense.id} expense={expense} groupId={groupId} members={members} />
              ))}
              <button
                onClick={() => setEditingReceipt(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-all"
              >
                <Pencil className="size-3" />
                Edit receipt
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingReceipt && (
          <EditReceiptModal
            expenses={expenses}
            groupId={groupId}
            members={members}
            onClose={() => setEditingReceipt(false)}
          />
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

  const cat = getCategoryInfo(expense.category);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={() => setEditingExpense(true)}
      >
        <MemberAvatarStack members={expense.payers.map((p) => ({ name: p.member_name, color: p.member_color }))} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate flex items-center gap-1.5">
            {expense.description}
            {cat && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground shrink-0">
                {cat.emoji} {cat.label}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {payerSummary(expense.payers)} paid &middot; {formattedDate}
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
