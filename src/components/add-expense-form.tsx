"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Receipt } from "lucide-react";
import { addExpense } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { SplitEditor } from "@/components/split-editor";
import { PayerEditor } from "@/components/payer-editor";
import { computeSplits, toNumericWeights, type SplitMode } from "@/lib/splits";
import { computePayers } from "@/lib/payers";
import { parseMoney } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/lib/db-types";
import type { Member } from "@/lib/db-types";

export function AddExpenseForm({
  groupId,
  members,
}: {
  groupId: number;
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<Set<number>>(new Set());
  const [paidAmounts, setPaidAmounts] = useState<Record<number, string>>({});
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [splitWith, setSplitWith] = useState<Set<number>>(new Set(members.map((m) => m.id)));
  const [splitWeights, setSplitWeights] = useState<Record<number, string>>({});
  const [category, setCategory] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // The form keeps what the user typed as a string; cents are derived once here
  // and everything downstream — preview, validation, submission — is integers.
  const amountCents = parseMoney(amount) ?? 0;
  const participantIds = members.filter((m) => splitWith.has(m.id)).map((m) => m.id);
  const splitResult = computeSplits(splitMode, amountCents, participantIds, toNumericWeights(splitWeights, splitMode));
  const payerResult = computePayers(amountCents, Array.from(paidBy), paidAmounts);

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

  function handleSubmit() {
    if (!description || !amount || !payerResult.valid || !splitResult.valid) return;
    const formData = new FormData();
    formData.set("groupId", String(groupId));
    formData.set("description", description);
    formData.set("amount", amount);
    // The action re-parses `amount` itself, so what is sent stays the raw text.
    formData.set("payers", JSON.stringify(payerResult.payers));
    formData.set("splitMode", splitMode);
    formData.set("splits", JSON.stringify(splitResult.splits));
    if (category) formData.set("category", category);
    startTransition(async () => {
      await addExpense(formData);
      reset();
    });
  }

  function reset() {
    setDescription("");
    setAmount("");
    setPaidBy(new Set());
    setPaidAmounts({});
    setSplitMode("equal");
    setSplitWith(new Set(members.map((m) => m.id)));
    setSplitWeights({});
    setCategory("");
    setOpen(false);
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground px-4 py-4 font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-shadow whitespace-nowrap"
      >
        <Plus className="size-5 shrink-0" />
        <span className="text-sm sm:text-base">Add Expense</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
            onClick={(e) => e.target === e.currentTarget && reset()}
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
                  <Receipt className="size-5 text-primary" />
                  <h2 className="font-heading text-xl font-bold">New Expense</h2>
                </div>
                <button onClick={reset} className="text-muted-foreground hover:text-foreground">
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
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-2xl font-heading font-bold tabular-nums placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  />
                </div>

                {/* Category */}
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

                {/* Paid by */}
                <PayerEditor
                  members={members}
                  selected={paidBy}
                  onToggle={togglePayer}
                  amounts={paidAmounts}
                  onAmountChange={(id, value) => setPaidAmounts((a) => ({ ...a, [id]: value }))}
                  result={payerResult}
                />

                {/* Split */}
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
                  onClick={handleSubmit}
                  disabled={!description || !amount || !payerResult.valid || !splitResult.valid || isPending}
                  className="w-full h-12 rounded-xl text-base font-semibold"
                >
                  {isPending ? "Adding..." : "Add Expense"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
