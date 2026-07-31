"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { addExpense } from "@/lib/actions";
import { SheetOverlay } from "@/components/ui/sheet-overlay";
import { SplitEditor } from "@/components/split-editor";
import { PayerEditor } from "@/components/payer-editor";
import { computeSplits, toNumericWeights, type SplitMode } from "@/lib/splits";
import { computePayers } from "@/lib/payers";
import { parseMoney } from "@/lib/money";
import { toSpentAt, todayInput } from "@/lib/dates";
import { DateField } from "@/components/date-field";
import { EXPENSE_CATEGORIES } from "@/lib/db-types";
import type { Member } from "@/lib/db-types";

export function AddExpenseForm({
  groupId,
  members,
  // The header variant used above `lg`, where this is a button among buttons
  // rather than the full-width primary action of a phone screen.
  compact = false,
}: {
  groupId: number;
  members: Member[];
  compact?: boolean;
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
  // Defaults to today, so the common case is still one tap; `toSpentAt` sends
  // nothing when it is left there, letting the database stamp the real instant.
  const [day, setDay] = useState(todayInput());
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
    const spentAt = toSpentAt(day);
    if (spentAt) formData.set("spentAt", spentAt);
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
    setDay(todayInput());
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center justify-center gap-1.5 rounded-full bg-primary font-medium text-primary-foreground transition-opacity hover:opacity-90 active:translate-y-px ${
          compact ? "h-9 px-3.5 text-sm" : "h-12 w-full gap-2 text-[15px]"
        }`}
      >
        <Plus className="size-4.5 shrink-0" />
        Aggiungi spesa
      </button>

      <AnimatePresence>
        {open && (
          <SheetOverlay onClose={reset}>
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] border border-border bg-raised p-5 pb-8 sm:max-w-md sm:rounded-[22px] sm:pb-5"
            >
              {/* Grab handle: this is a sheet on a phone, and the handle is what
                  says so before anyone tries to drag it. */}
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />

              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-medium">Nuova spesa</h2>
                <button
                  onClick={reset}
                  aria-label="Chiudi"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4.5" />
                </button>
              </div>

              <div className="space-y-5">
                {/* The amount is the hero of this sheet, not a field among
                    fields: it is the one thing every expense has. */}
                <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-[28px] leading-none text-foreground">&euro;</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      autoFocus
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="figure w-44 border-0 bg-transparent p-0 text-center text-[44px] leading-none font-medium text-primary placeholder:text-muted-foreground/40 focus:outline-none"
                    />
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Per cosa?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                <DateField value={day} onChange={setDay} />

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    Categoria
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setCategory(category === cat.id ? "" : cat.id)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                          category === cat.id
                            ? "bg-brand-field text-primary ring-1 ring-primary"
                            : "bg-muted text-muted-foreground hover:text-foreground"
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

                <button
                  onClick={handleSubmit}
                  disabled={!description || !amount || !payerResult.valid || !splitResult.valid || isPending}
                  className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {isPending ? "Aggiunta…" : "Aggiungi spesa"}
                </button>
              </div>
            </motion.div>
          </SheetOverlay>
        )}
      </AnimatePresence>
    </>
  );
}
