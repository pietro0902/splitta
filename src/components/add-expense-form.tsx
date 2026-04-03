"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Receipt } from "lucide-react";
import { addExpense } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/member-avatar";
import type { Member } from "@/lib/db";

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
  const [paidBy, setPaidBy] = useState<number | null>(null);
  const [splitWith, setSplitWith] = useState<Set<number>>(new Set(members.map((m) => m.id)));
  const [isPending, startTransition] = useTransition();

  function toggleSplit(id: number) {
    const next = new Set(splitWith);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSplitWith(next);
  }

  function handleSubmit() {
    if (!description || !amount || !paidBy || splitWith.size === 0) return;
    const formData = new FormData();
    formData.set("groupId", String(groupId));
    formData.set("description", description);
    formData.set("amount", amount);
    formData.set("paidByMemberId", String(paidBy));
    formData.set("splitMemberIds", Array.from(splitWith).join(","));
    startTransition(async () => {
      await addExpense(formData);
      reset();
    });
  }

  function reset() {
    setDescription("");
    setAmount("");
    setPaidBy(null);
    setSplitWith(new Set(members.map((m) => m.id)));
    setOpen(false);
  }

  const splitAmount = splitWith.size > 0 && amount ? Number(amount) / splitWith.size : 0;

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-2xl bg-primary text-primary-foreground px-5 py-4 font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
      >
        <Plus className="size-5" />
        Add Expense
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

                {/* Paid by */}
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

                {/* Split with */}
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
                  onClick={handleSubmit}
                  disabled={!description || !amount || !paidBy || splitWith.size === 0 || isPending}
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
