"use client";

import { useState, useTransition, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  X,
  Loader2,
  Check,
  TriangleAlert,
  ScanLine,
  Image as ImageIcon,
} from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { PayerEditor } from "@/components/payer-editor";
import { computePayers } from "@/lib/payers";
import { formatMoney, toCents } from "@/lib/money";
import { createExpensesFromReceipt } from "@/lib/actions";
import { scanReceipt, type OcrProgress } from "@/lib/ocr";
import { receiptReconciles } from "@/lib/receipts";
import { toSpentAt, todayInput } from "@/lib/dates";
import { DateField } from "@/components/date-field";
import type { ParsedItem } from "@/lib/receipt-parser";
import { EXPENSE_CATEGORIES } from "@/lib/db-types";
import type { Member } from "@/lib/db-types";

type ItemWithSplits = ParsedItem & {
  splitMemberIds: Set<number>;
};

/** How many lines a long receipt shows before it collapses. */
const VISIBLE_LINES = 6;

export function ReceiptScanner({
  groupId,
  members,
}: {
  groupId: number;
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<ItemWithSplits[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [paidBy, setPaidBy] = useState<Set<number>>(new Set());
  const [paidAmounts, setPaidAmounts] = useState<Record<number, string>>({});
  const [receiptName, setReceiptName] = useState("");
  const [category, setCategory] = useState<string>("");
  // Scanning last night's receipt this morning is the normal case, not the
  // exception, so the day is asked for on the review screen.
  const [day, setDay] = useState(todayInput());
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [declaredTotal, setDeclaredTotal] = useState<number | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  /**
   * Builds the on-screen thumbnail. Decodes through createImageBitmap — the same
   * decoder the OCR path uses — so a format the recognizer can't handle fails
   * here, at pick time, instead of showing a fine preview and then a mysterious
   * scan error. Returns a data URL, so there's no object URL left to revoke.
   */
  async function buildPreview(file: File, maxDimension = 1536): Promise<string> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(
      maxDimension / bitmap.width,
      maxDimension / bitmap.height,
      1
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.8);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    // Clear the input so picking the same file again still fires onChange —
    // otherwise re-selecting a photo after removing the preview does nothing.
    e.target.value = "";
    setError(null);
    // Keep the original for OCR — preprocessing scales it to what the
    // recognizer wants. The preview copy is only for display.
    setFile(f);
    buildPreview(f)
      .then(setPreview)
      .catch(() => setError("Non riesco a leggere questa immagine. Prova con una foto JPEG o PNG."));
  }

  async function handleScan() {
    if (!file) return;

    setIsScanning(true);
    setError(null);
    setProgress({ ratio: 0, label: "Avvio" });

    try {
      const result = await scanReceipt(file, setProgress);

      if (result.items.length === 0) {
        setError("Non ho letto nessuna voce. Prova con una foto più dritta e più illuminata.");
        return;
      }

      setItems(
        result.items.map((item) => ({
          ...item,
          splitMemberIds: new Set(members.map((m) => m.id)),
        }))
      );
      setDeclaredTotal(result.declaredTotal);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Scansione fallita: ${message}`);
    } finally {
      setIsScanning(false);
      setProgress(null);
    }
  }

  function toggleItemSplit(itemIndex: number, memberId: number) {
    setItems((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const item = { ...next[itemIndex], splitMemberIds: new Set(next[itemIndex].splitMemberIds) };
      if (item.splitMemberIds.has(memberId)) item.splitMemberIds.delete(memberId);
      else item.splitMemberIds.add(memberId);
      next[itemIndex] = item;
      return next;
    });
  }

  function updateItem(index: number, field: "name" | "price", value: string) {
    setItems((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: field === "price" ? Number(value) || 0 : value,
      };
      return next;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => prev ? prev.filter((_, i) => i !== index) : prev);
  }

  function togglePayer(id: number) {
    const next = new Set(paidBy);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPaidBy(next);
  }

  // The review list stays in euros because that is what the parser produces and
  // what the per-line input edits; cents start here, at the totals, and are what
  // leaves for the server. Converting each line before summing is also stricter
  // than converting the sum, which is where a float total would drift.
  const totalCents = items?.reduce((s, i) => s + toCents(i.price), 0) ?? 0;
  const declaredTotalCents = declaredTotal !== null ? toCents(declaredTotal) : null;
  const payerResult = computePayers(totalCents, Array.from(paidBy), paidAmounts);

  // Derived, not stored: the user edits prices in review, so a discrepancy
  // captured at scan time would keep contradicting the live total and could
  // never clear once they fixed the misread line.
  const discrepancy = declaredTotalCents !== null ? totalCents - declaredTotalCents : null;
  const totalMatches = declaredTotalCents !== null && receiptReconciles(totalCents, declaredTotalCents);

  function handleSubmit() {
    if (!items || !payerResult.valid) return;
    startSubmit(async () => {
      await createExpensesFromReceipt(
        groupId,
        payerResult.payers,
        items.map((item) => ({
          name: item.name,
          priceCents: toCents(item.price),
          splitMemberIds: Array.from(item.splitMemberIds),
        })),
        receiptName,
        category || undefined,
        declaredTotalCents ?? undefined,
        toSpentAt(day)
      );
      reset();
    });
  }

  function reset() {
    setOpen(false);
    setPreview(null);
    setFile(null);
    setItems(null);
    setShowAll(false);
    setPaidBy(new Set());
    setPaidAmounts({});
    setReceiptName("");
    setCategory("");
    setDay(todayInput());
    setError(null);
    setDeclaredTotal(null);
    setProgress(null);
  }

  const visibleItems = items && !showAll ? items.slice(0, VISIBLE_LINES) : items;
  const hiddenCount = items && !showAll ? Math.max(0, items.length - VISIBLE_LINES) : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Scansiona uno scontrino"
        className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border text-primary transition-colors hover:bg-muted active:translate-y-px"
      >
        <ScanLine className="size-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-4"
            onClick={(e) => e.target === e.currentTarget && reset()}
          >
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] border border-border bg-raised p-5 pb-8 sm:max-w-lg sm:rounded-[22px] sm:pb-5"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />

              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-medium">
                  {items ? "Controlla lo scontrino" : "Scansiona uno scontrino"}
                </h2>
                <button
                  onClick={reset}
                  aria-label="Chiudi"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4.5" />
                </button>
              </div>

              {!items ? (
                <div className="space-y-5">
                  {/* Two inputs, two buttons: `capture` opens the camera but
                      suppresses the gallery, and dropping it lets the OS decide
                      — which on some phones means the gallery only. Neither
                      single input can offer both reliably, so make the choice
                      explicit instead of leaving it to the platform. */}
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFile}
                    className="hidden"
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    className="hidden"
                  />

                  {preview ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a
                          data URL built on-device; next/image would only add a
                          loader in front of bytes that never touch the network */}
                      <img
                        src={preview}
                        alt="Anteprima dello scontrino"
                        className="max-h-64 w-full rounded-xl border border-border object-contain"
                      />
                      <button
                        onClick={() => {
                          setPreview(null);
                          setFile(null);
                        }}
                        aria-label="Togli la foto"
                        className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => cameraRef.current?.click()}
                        className="rounded-2xl border border-dashed border-border px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted"
                      >
                        <Camera className="mx-auto mb-2.5 size-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Scatta una foto</p>
                      </button>
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="rounded-2xl border border-dashed border-border px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted"
                      >
                        <ImageIcon className="mx-auto mb-2.5 size-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Dalla galleria</p>
                      </button>
                    </div>
                  )}

                  {error && <p className="text-center text-sm text-destructive">{error}</p>}

                  {isScanning && progress && (
                    <div className="space-y-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full rounded-full bg-primary"
                          animate={{ width: `${Math.round(progress.ratio * 100)}%` }}
                          transition={{ ease: "easeOut", duration: 0.3 }}
                        />
                      </div>
                      <p className="text-center text-xs text-muted-foreground">
                        {progress.label} — gira sul tuo telefono, non si carica niente
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleScan}
                    disabled={!file || isScanning}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Scansione…
                      </>
                    ) : (
                      "Scansiona"
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Whether the scan reconciles is the first thing on this
                      screen, not a line of small print at the bottom: it is the
                      one question a reviewer has, and the answer decides whether
                      the rest of the list needs reading at all. */}
                  {declaredTotalCents === null ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted px-3.5 py-3 text-xs text-muted-foreground">
                      <TriangleAlert className="mt-px size-4 shrink-0" />
                      <p className="leading-relaxed">
                        Non ho letto il totale stampato, quindi queste {items.length} voci non si
                        possono verificare da sole. Confrontale con lo scontrino prima di
                        aggiungerle.
                      </p>
                    </div>
                  ) : (
                    <div
                      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs ${
                        totalMatches
                          ? "border-ok-border bg-ok-field text-ok-foreground"
                          : "border-negative/30 bg-negative/10 text-negative"
                      }`}
                    >
                      {totalMatches ? (
                        <Check className="mt-px size-4 shrink-0" />
                      ) : (
                        <TriangleAlert className="mt-px size-4 shrink-0" />
                      )}
                      <p className="leading-relaxed">
                        {totalMatches ? (
                          <>Le voci tornano con il totale stampato ({formatMoney(declaredTotalCents)}).</>
                        ) : (
                          <>
                            Lo scontrino dice {formatMoney(declaredTotalCents)}, ma le voci fanno{" "}
                            {formatMoney(totalCents)} — {discrepancy! > 0 ? "in più" : "in meno"} di{" "}
                            {formatMoney(Math.abs(discrepancy!))}. Cerca una riga saltata o letta
                            male.
                          </>
                        )}
                      </p>
                    </div>
                  )}

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

                  {/* One category for the whole receipt. Asked here because
                      this is the only moment the shop is on screen; without it
                      every scanned line is stored uncategorised and drops out
                      of the analytics breakdown entirely. */}
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

                  {/* The parsed lines, as a receipt reads: name on the left,
                      price on the right, hairlines between. */}
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      Voci ({items.length})
                    </label>
                    <div className="divide-y divide-hairline">
                      {visibleItems!.map((item, idx) => (
                        <div key={idx} className="py-2.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateItem(idx, "name", e.target.value)}
                              className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-1 text-sm focus:bg-muted focus:outline-none"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => updateItem(idx, "price", e.target.value)}
                              className="figure w-20 rounded-lg bg-transparent px-1 py-1 text-right text-sm focus:bg-muted focus:outline-none"
                            />
                            <button
                              onClick={() => removeItem(idx)}
                              aria-label="Togli la voce"
                              className="shrink-0 p-1 text-muted-foreground/60 transition-colors hover:text-destructive"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>

                          {/* Why this price is what it is — helps the review pass */}
                          {(item.discounted || item.quantity) && (
                            <p className="px-1 text-[11px] text-muted-foreground">
                              {[
                                item.quantity ? `${item.quantity} × prezzo unitario` : null,
                                item.discounted ? "sconto applicato" : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}

                          {/* Who splits this line, as chips: a receipt's whole
                              point is that one line can be shared differently
                              from the one above it. */}
                          <div className="no-scrollbar -mx-1 mt-1 flex gap-1 overflow-x-auto px-1 py-0.5">
                            {members.map((m) => {
                              const on = item.splitMemberIds.has(m.id);
                              return (
                                <button
                                  key={m.id}
                                  onClick={() => toggleItemSplit(idx, m.id)}
                                  aria-label={`${m.name} divide questa voce`}
                                  className={`shrink-0 rounded-[9px] transition-opacity ${
                                    on ? "ring-1 ring-primary" : "opacity-35"
                                  }`}
                                >
                                  <MemberAvatar name={m.name} color={m.color} size="sm" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {hiddenCount > 0 && (
                      <button
                        onClick={() => setShowAll(true)}
                        className="mt-2 w-full rounded-lg py-2 text-sm text-primary transition-colors hover:bg-muted"
                      >
                        + altre {hiddenCount} voci
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-sm text-muted-foreground">Totale</span>
                    <span className="figure text-lg font-medium">{formatMoney(totalCents)}</span>
                  </div>

                  <PayerEditor
                    members={members}
                    selected={paidBy}
                    onToggle={togglePayer}
                    amounts={paidAmounts}
                    onAmountChange={(id, value) => setPaidAmounts((a) => ({ ...a, [id]: value }))}
                    result={payerResult}
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setItems(null);
                        setShowAll(false);
                        setError(null);
                        setDeclaredTotal(null);
                      }}
                      className="h-12 shrink-0 rounded-full border border-border px-5 text-[15px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Riscansiona
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={!payerResult.valid || items.length === 0 || isSubmitting}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Aggiunta…
                        </>
                      ) : (
                        `Aggiungi ${items.length} voci`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
