"use client";

import { useState, useTransition, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  X,
  Loader2,
  Check,
  TriangleAlert,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/member-avatar";
import { PayerEditor } from "@/components/payer-editor";
import { computePayers } from "@/lib/payers";
import { formatMoney, toCents } from "@/lib/money";
import { createExpensesFromReceipt } from "@/lib/actions";
import { scanReceipt, type OcrProgress } from "@/lib/ocr";
import type { ParsedItem } from "@/lib/receipt-parser";
import type { Member } from "@/lib/db-types";

type ItemWithSplits = ParsedItem & {
  splitMemberIds: Set<number>;
};

/** One cent of slack absorbs the receipt's own rounding. */
const TOTAL_TOLERANCE_CENTS = 1;

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
  const [paidBy, setPaidBy] = useState<Set<number>>(new Set());
  const [paidAmounts, setPaidAmounts] = useState<Record<number, string>>({});
  const [receiptName, setReceiptName] = useState("");
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
      .catch(() =>
        setError("Couldn't read that image. Try a JPEG or PNG photo.")
      );
  }

  async function handleScan() {
    if (!file) return;

    setIsScanning(true);
    setError(null);
    setProgress({ ratio: 0, label: "Starting" });

    try {
      const result = await scanReceipt(file, setProgress);

      if (result.items.length === 0) {
        setError(
          "Couldn't read any items. Try a straighter, better-lit photo of the receipt."
        );
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
      setError(`Scan failed: ${message}`);
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
  const totalMatches = discrepancy !== null && Math.abs(discrepancy) <= TOTAL_TOLERANCE_CENTS;

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
        receiptName
      );
      reset();
    });
  }

  function reset() {
    setOpen(false);
    setPreview(null);
    setFile(null);
    setItems(null);
    setPaidBy(new Set());
    setPaidAmounts({});
    setReceiptName("");
    setError(null);
    setDeclaredTotal(null);
    setProgress(null);
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 rounded-2xl bg-card border border-border px-4 py-4 font-semibold hover:bg-accent/50 transition-colors whitespace-nowrap"
      >
        <Camera className="size-5 shrink-0" />
        <span className="text-sm sm:text-base">Scan</span>
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
              className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Camera className="size-5 text-primary" />
                  <h2 className="font-heading text-xl font-bold">Scan Receipt</h2>
                </div>
                <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                  <X className="size-5" />
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
                      <img
                        src={preview}
                        alt="Receipt preview"
                        className="w-full rounded-xl border border-border object-contain max-h-64"
                      />
                      <button
                        onClick={() => {
                          setPreview(null);
                          setFile(null);
                        }}
                        className="absolute top-2 right-2 rounded-full bg-black/60 text-white p-1.5"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => cameraRef.current?.click()}
                        className="rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-10 text-center hover:border-primary/50 hover:bg-muted/50 transition-all"
                      >
                        <Camera className="size-7 mx-auto mb-2.5 text-muted-foreground" />
                        <p className="text-sm font-medium text-muted-foreground">
                          Take a photo
                        </p>
                      </button>
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-10 text-center hover:border-primary/50 hover:bg-muted/50 transition-all"
                      >
                        <ImageIcon className="size-7 mx-auto mb-2.5 text-muted-foreground" />
                        <p className="text-sm font-medium text-muted-foreground">
                          From gallery
                        </p>
                      </button>
                    </div>
                  )}

                  {error && (
                    <p className="text-sm text-destructive text-center">{error}</p>
                  )}

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
                        {progress.label} — runs on your device, nothing is uploaded
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={handleScan}
                    disabled={!file || isScanning}
                    className="w-full h-12 rounded-xl text-base font-semibold"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="size-4 animate-spin mr-2" />
                        Scanning...
                      </>
                    ) : (
                      "Scan Receipt"
                    )}
                  </Button>
                </div>
              ) : (
                /* Items review phase */
                <div className="space-y-5">
                  {/* Receipt name */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Receipt name (optional)
                    </label>
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

                  {/* Items list */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Items ({items.length})
                    </label>
                    <div className="space-y-3">
                      {items.map((item, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-border bg-background p-4 space-y-3"
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => updateItem(idx, "name", e.target.value)}
                              className="flex-1 min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                            />
                            <div className="relative shrink-0">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                                &euro;
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                value={item.price}
                                onChange={(e) => updateItem(idx, "price", e.target.value)}
                                className="w-24 rounded-lg border border-border bg-card pl-7 pr-2 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                              />
                            </div>
                            <button
                              onClick={() => removeItem(idx)}
                              className="text-muted-foreground hover:text-destructive p-1.5 shrink-0"
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          {/* Why this price is what it is — helps the review pass */}
                          {(item.discounted || item.quantity) && (
                            <p className="text-[11px] text-muted-foreground -mt-1">
                              {[
                                item.quantity ? `${item.quantity} × unit price` : null,
                                item.discounted ? "discount applied" : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}

                          {/* Split selection per item — single scrollable row on mobile */}
                          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
                            {members.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => toggleItemSplit(idx, m.id)}
                                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all shrink-0 whitespace-nowrap ${
                                  item.splitMemberIds.has(m.id)
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
                  </div>

                  {/* Cross-check against the total printed on the receipt */}
                  {/* No printed total means no automatic cross-check. Say so:
                      an absent banner would read as "all good" when in fact
                      nothing was verified. */}
                  {declaredTotal === null && (
                    <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                      <TriangleAlert className="size-4 shrink-0 mt-px" />
                      <p className="leading-relaxed">
                        Couldn&apos;t read the total printed on the receipt, so these{" "}
                        {items.length} items can&apos;t be checked automatically. Compare
                        them with the receipt before adding.
                      </p>
                    </div>
                  )}

                  {declaredTotalCents !== null && discrepancy !== null && (
                    <div
                      className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
                        totalMatches
                          ? "border-primary/30 bg-primary/5 text-primary"
                          : "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-500"
                      }`}
                    >
                      {totalMatches ? (
                        <Check className="size-4 shrink-0 mt-px" />
                      ) : (
                        <TriangleAlert className="size-4 shrink-0 mt-px" />
                      )}
                      <p className="leading-relaxed">
                        {totalMatches ? (
                          <>
                            Items add up to the receipt total (
                            {formatMoney(declaredTotalCents)}).
                          </>
                        ) : (
                          <>
                            The receipt says {formatMoney(declaredTotalCents)}, but these items
                            add up to {formatMoney(totalCents)} —{" "}
                            {discrepancy > 0 ? "over" : "short"} by{" "}
                            {formatMoney(Math.abs(discrepancy))}. Check for a missing or misread
                            line.
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Total & submit */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-sm font-medium text-muted-foreground">Total</span>
                    <span className="text-lg font-heading font-bold tabular-nums">
                      {formatMoney(totalCents)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setItems(null);
                        setError(null);
                        setDeclaredTotal(null);
                      }}
                      className="flex-1 h-12 rounded-xl text-base"
                    >
                      Re-scan
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={!payerResult.valid || items.length === 0 || isSubmitting}
                      className="flex-1 h-12 rounded-xl text-base font-semibold"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          Adding...
                        </>
                      ) : (
                        `Add ${items.length} Expenses`
                      )}
                    </Button>
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
