"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Receipt, ChevronDown, X, Plus, TriangleAlert } from "lucide-react";
import { SheetOverlay } from "@/components/ui/sheet-overlay";
import { MemberAvatar } from "@/components/member-avatar";
import { deleteExpense, updateExpense, saveReceipt } from "@/lib/actions";
import { SplitEditor } from "@/components/split-editor";
import { PayerEditor } from "@/components/payer-editor";
import { computeSplits, toNumericWeights, SPLIT_MODES, type SplitMode } from "@/lib/splits";
import { computePayers } from "@/lib/payers";
import { formatAmount, formatMoney, parseMoney } from "@/lib/money";
import { groupExpenses, receiptDate, receiptPayers, receiptReconciles } from "@/lib/receipts";
import { atNoon, expenseDate, formatDay, toDateInput } from "@/lib/dates";
import { DateField } from "@/components/date-field";
import { EXPENSE_CATEGORIES } from "@/lib/db-types";
import type { Expense, ExpensePayer, Member } from "@/lib/db-types";

function getCategoryInfo(categoryId: string | null) {
  if (!categoryId) return null;
  return EXPENSE_CATEGORIES.find((c) => c.id === categoryId) ?? null;
}

function payerSummary(payers: ExpensePayer[]): string {
  return payers.map((p) => p.member_name).join(" e ");
}

// "Giulia · 18 lug", or just the date if the row has no payers at all. Joining
// unconditionally leaves a leading "· " hanging off a row whose payers never
// got written -- rare, but it is exactly the kind of row you would be looking
// at *because* something is wrong with it.
function rowMeta(payers: ExpensePayer[], iso: string): string {
  return [payerSummary(payers), formatDay(iso)].filter(Boolean).join(" · ");
}

// What this row costs *you* -- the figure the design puts under every amount,
// because €148,50 is not the number anyone is scanning the list for. Null when
// this browser never said which member it is, or when you are not on the split
// at all: an explicit "tua: €0,00" on somebody else's dinner is noise.
function myShareCents(expenses: Expense[], myMemberId: number | null): number | null {
  if (myMemberId === null) return null;
  let total = 0;
  for (const e of expenses) {
    for (const s of e.splits) if (s.member_id === myMemberId) total += s.amount_cents;
  }
  return total > 0 ? total : null;
}

function MyShare({ cents }: { cents: number | null }) {
  if (cents === null) return null;
  return <span className="block text-[11px] text-muted-foreground">tua: {formatMoney(cents)}</span>;
}

export function ExpenseList({
  expenses,
  groupId,
  members,
  myMemberId = null,
}: {
  expenses: Expense[];
  groupId: number;
  members: Member[];
  myMemberId?: number | null;
}) {
  if (expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-raised px-5 py-10 text-center">
        <p className="font-medium">Ancora nessuna spesa</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggiungi la prima spesa, o scansiona uno scontrino.
        </p>
      </div>
    );
  }

  const entries = groupExpenses(expenses);

  // Hairlines, not cards. Eighty bordered rounded boxes is chrome, not design --
  // seven of them fill a phone screen and the list stops being readable.
  return (
    <div className="divide-y divide-hairline">
      {entries.map((entry) =>
        entry.type === "single" ? (
          <ExpenseItem
            key={entry.expense.id}
            expense={entry.expense}
            groupId={groupId}
            members={members}
            myMemberId={myMemberId}
          />
        ) : (
          <ReceiptGroup
            key={entry.receiptId}
            expenses={entry.expenses}
            groupId={groupId}
            members={members}
            myMemberId={myMemberId}
          />
        )
      )}
    </div>
  );
}

// The shell both editors sit in: a bottom sheet on a phone, a centred panel on
// anything wider.
function Sheet({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <SheetOverlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] border border-border bg-raised p-5 pb-8 sm:rounded-[22px] sm:pb-5 ${
          wide ? "sm:max-w-lg" : "sm:max-w-md"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-medium">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4.5" />
          </button>
        </div>
        {children}
      </motion.div>
    </SheetOverlay>
  );
}

function CategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-muted-foreground">
        Categoria
      </label>
      <div className="flex flex-wrap gap-1.5">
        {EXPENSE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChange(value === cat.id ? "" : cat.id)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              value === cat.id
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
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {children}
    </button>
  );
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
      // The editor's field is in euros, while the stored weight is cents.
      weights[s.member_id] = formatAmount(s.weight ?? s.amount_cents);
    } else if (mode === "percent") {
      const derived =
        expense.amount_cents > 0
          ? Math.round((s.amount_cents / expense.amount_cents) * 10000) / 100
          : 0;
      weights[s.member_id] = String(s.weight ?? derived);
    } else {
      weights[s.member_id] = String(s.weight ?? 1);
    }
  }
  return weights;
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
  const [amount, setAmount] = useState(formatAmount(expense.amount_cents));
  const [paidBy, setPaidBy] = useState<Set<number>>(new Set(expense.payers.map((p) => p.member_id)));
  const [paidAmounts, setPaidAmounts] = useState<Record<number, string>>(
    Object.fromEntries(expense.payers.map((p) => [p.member_id, formatAmount(p.amount_cents)]))
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
  // Compared against its starting value on save: an untouched field must not
  // rewrite the stored timestamp, since that would flatten the time of day the
  // row was originally written with and reshuffle same-day ordering.
  const originalDay = toDateInput(expenseDate(expense));
  const [day, setDay] = useState(originalDay);
  const [isPending, startTransition] = useTransition();

  const participantIds = members.filter((m) => splitWith.has(m.id)).map((m) => m.id);
  const amountCents = parseMoney(amount) ?? 0;
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

  function handleSave() {
    if (!description || !amount || !payerResult.valid || !splitResult.valid) return;
    startTransition(async () => {
      await updateExpense(
        expense.id,
        groupId,
        description,
        amountCents,
        payerResult.payers,
        splitResult.splits,
        splitMode,
        category || undefined,
        day !== originalDay ? atNoon(day) : undefined
      );
      onClose();
    });
  }

  return (
    <Sheet title="Modifica spesa" onClose={onClose}>
      <div className="space-y-5">
        {/* The amount is the hero of the sheet, not a field among fields. */}
        <div className="rounded-2xl border border-border bg-card px-4 py-5 text-center">
          <div className="flex items-center justify-center gap-1">
            <span className="text-2xl text-foreground">&euro;</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="figure w-40 border-0 bg-transparent p-0 text-center text-[38px] font-medium text-primary focus:outline-none"
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

        <CategoryPicker value={category} onChange={setCategory} />

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

        <PrimaryButton
          onClick={handleSave}
          disabled={!description || !amount || !payerResult.valid || !splitResult.valid || isPending}
        >
          {isPending ? "Salvataggio…" : "Salva"}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

type ReceiptLine = {
  id?: number;
  name: string;
  price: string;
  splitMemberIds: Set<number>;
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
  // A receipt has one category; a line keeping its own would have no way to be
  // set, since the editor deliberately has one control for the whole shop.
  const [category, setCategory] = useState<string>(
    expenses.find((e) => e.category)?.category ?? ""
  );
  // One date for the whole shop, like the category: the receipt happened on one
  // day, and its lines are an implementation detail of how it is stored.
  const originalDay = toDateInput(receiptDate(expenses));
  const [day, setDay] = useState(originalDay);
  const receiptPayerTotals = new Map<number, number>();
  for (const e of expenses) {
    for (const p of e.payers) {
      receiptPayerTotals.set(p.member_id, (receiptPayerTotals.get(p.member_id) ?? 0) + p.amount_cents);
    }
  }
  const [paidBy, setPaidBy] = useState<Set<number>>(new Set(receiptPayerTotals.keys()));
  const [paidAmounts, setPaidAmounts] = useState<Record<number, string>>(
    Object.fromEntries(Array.from(receiptPayerTotals.entries()).map(([id, amt]) => [id, formatAmount(amt)]))
  );
  const [lines, setLines] = useState<ReceiptLine[]>(() =>
    expenses.map((e) => ({
      id: e.id,
      name: e.description,
      price: formatAmount(e.amount_cents),
      splitMemberIds: new Set(e.splits.map((s) => s.member_id)),
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

  // Lines keep the user's raw text; the running total is cents.
  const total = lines.reduce((s, l) => s + (parseMoney(l.price) ?? 0), 0);
  const declared = expenses[0].receipt_declared_total_cents;
  const payerResult = computePayers(total, Array.from(paidBy), paidAmounts);
  const canSave =
    payerResult.valid &&
    lines.some((l) => l.name.trim() && (parseMoney(l.price) ?? 0) > 0 && l.splitMemberIds.size > 0);

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
          priceCents: parseMoney(l.price) ?? 0,
          splitMemberIds: Array.from(l.splitMemberIds),
          category: category || undefined,
        })),
        originalIds,
        category || undefined,
        day !== originalDay ? atNoon(day) : undefined
      );
      onClose();
    });
  }

  return (
    <Sheet title="Modifica scontrino" onClose={onClose} wide>
      <div className="space-y-5">
        {/* Does this add up? The parser stored the printed total, so the answer
            survives the scan and can still be shown while editing -- and it
            updates live as lines are corrected. */}
        {declared !== null && <ReconcileStrip total={total} declared={declared} />}

        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Nome dello scontrino
          </label>
          <input
            type="text"
            value={receiptName}
            onChange={(e) => setReceiptName(e.target.value)}
            placeholder="es. Supermercato, Cena…"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <DateField value={day} onChange={setDay} />

        {/* Category, applied to every line on save. This is also how the
            receipts scanned before the scanner asked for one get fixed. */}
        <CategoryPicker value={category} onChange={setCategory} />

        <PayerEditor
          members={members}
          selected={paidBy}
          onToggle={togglePayer}
          amounts={paidAmounts}
          onAmountChange={(id, value) => setPaidAmounts((a) => ({ ...a, [id]: value }))}
          result={payerResult}
        />

        <div>
          <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Voci ({lines.length})
          </label>
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={line.id ?? `new-${idx}`} className="space-y-2.5 rounded-xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={line.name}
                    placeholder="Voce"
                    onChange={(e) => updateLine(idx, "name", e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="relative shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      &euro;
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.price}
                      placeholder="0.00"
                      onChange={(e) => updateLine(idx, "price", e.target.value)}
                      className="figure w-24 rounded-lg border border-border bg-background py-2 pl-7 pr-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <button
                    onClick={() => removeLine(idx)}
                    aria-label="Togli la voce"
                    className="shrink-0 p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Split selection per item — single scrollable row on mobile */}
                <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => toggleLineSplit(idx, m.id)}
                      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs transition-colors ${
                        line.splitMemberIds.has(m.id)
                          ? "bg-brand-field text-primary ring-1 ring-primary"
                          : "bg-muted text-muted-foreground"
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
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="size-4" />
            Aggiungi voce
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Totale</span>
          <span className="figure text-lg font-medium">{formatMoney(total)}</span>
        </div>

        <PrimaryButton onClick={handleSave} disabled={!canSave || isPending}>
          {isPending ? "Salvataggio…" : "Salva"}
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

// The cleverest thing in the codebase, made visible. The parser reads the total
// printed on the paper and checks the extracted items against it; that check
// used to be a line of small text that scrolled past. Cents are exact, so this
// is `===`, not an epsilon.
function ReconcileStrip({ total, declared }: { total: number; declared: number }) {
  const ok = receiptReconciles(total, declared);
  const diff = total - declared;
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${
        ok
          ? "border-ok-border bg-ok-field text-ok-foreground"
          : "border-negative/30 bg-negative/10 text-negative"
      }`}
    >
      {ok ? <Receipt className="size-4 shrink-0" /> : <TriangleAlert className="size-4 shrink-0" />}
      <span className="min-w-0">
        {ok ? (
          <>Le voci tornano con il totale stampato ({formatMoney(declared)})</>
        ) : (
          <>
            Le voci non tornano: {formatMoney(total)} contro {formatMoney(declared)} stampati (
            {diff > 0 ? "+" : "−"}
            {formatMoney(Math.abs(diff))})
          </>
        )}
      </span>
    </div>
  );
}

function ReceiptGroup({
  expenses,
  groupId,
  members,
  myMemberId,
}: {
  expenses: Expense[];
  groupId: number;
  members: Member[];
  myMemberId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState(false);
  const total = expenses.reduce((s, e) => s + e.amount_cents, 0);
  const payers = receiptPayers(expenses);
  const declared = expenses[0].receipt_declared_total_cents;
  // A scan that never added up stays flagged in the list, not just at the
  // moment it was reviewed -- that is what storing the declared total bought.
  const misread = declared !== null && !receiptReconciles(total, declared);
  const displayName = expenses[0].receipt_name || "Scontrino";

  return (
    <>
      <div className="flex items-center gap-3 py-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex size-[29px] shrink-0 items-center justify-center rounded-[9px] border border-brand-border bg-brand-field text-primary">
            <Receipt className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate text-[14px]">
              {displayName}
              {misread && <TriangleAlert className="size-3.5 shrink-0 text-negative" />}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {[payerSummary(payers), `${expenses.length} voci`, formatDay(receiptDate(expenses))]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="figure block text-[15px]">{formatMoney(total)}</span>
            <MyShare cents={myShareCents(expenses, myMemberId)} />
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mb-3 rounded-xl border border-border bg-card p-1.5">
              {expenses.map((expense) => (
                <ReceiptItemRow
                  key={expense.id}
                  expense={expense}
                  groupId={groupId}
                  members={members}
                  myMemberId={myMemberId}
                />
              ))}
              <button
                onClick={() => setEditingReceipt(true)}
                className="w-full rounded-lg py-2 text-xs text-primary transition-colors hover:bg-muted"
              >
                Modifica lo scontrino
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
    </>
  );
}

function ReceiptItemRow({
  expense,
  groupId,
  members,
  myMemberId,
}: {
  expense: Expense;
  groupId: number;
  members: Member[];
  myMemberId: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingExpense, setEditingExpense] = useState(false);

  return (
    <>
      <div className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted">
        <button onClick={() => setEditingExpense(true)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm">{expense.description}</span>
          <span className="block text-[11px] text-muted-foreground">
            {expense.splits.length === 1 ? "1 persona" : `${expense.splits.length} persone`}
          </span>
        </button>
        <span className="shrink-0 text-right">
          <span className="figure block text-sm">{formatMoney(expense.amount_cents)}</span>
          <MyShare cents={myShareCents([expense], myMemberId)} />
        </span>
        <button
          onClick={() => {
            if (confirm("Eliminare questa voce?")) {
              startTransition(() => deleteExpense(expense.id, groupId));
            }
          }}
          disabled={isPending}
          aria-label="Elimina la voce"
          className="shrink-0 rounded-lg p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
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
  myMemberId,
}: {
  expense: Expense;
  groupId: number;
  members: Member[];
  myMemberId: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingExpense, setEditingExpense] = useState(false);
  const cat = getCategoryInfo(expense.category);
  const lead = expense.payers[0];

  return (
    <>
      <div className="group flex items-center gap-3 py-3">
        <button
          onClick={() => setEditingExpense(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {lead ? (
            <MemberAvatar name={lead.member_name} color={lead.member_color} />
          ) : (
            <span className="size-[29px] shrink-0 rounded-[9px] bg-muted" />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate text-[14px]">
              {expense.description}
              {cat && <span className="shrink-0 text-[11px]">{cat.emoji}</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {rowMeta(expense.payers, expenseDate(expense))}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="figure block text-[15px]">{formatMoney(expense.amount_cents)}</span>
            <MyShare cents={myShareCents([expense], myMemberId)} />
          </span>
        </button>
        <button
          onClick={() => {
            if (confirm("Eliminare questa spesa?")) {
              startTransition(() => deleteExpense(expense.id, groupId));
            }
          }}
          disabled={isPending}
          aria-label="Elimina la spesa"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
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
