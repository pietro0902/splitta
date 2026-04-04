"use client";

import { useState, useTransition, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/member-avatar";
import {
  scanReceiptClaude,
  createExpensesFromReceipt,
} from "@/lib/actions";
import type { ReceiptItem } from "@/lib/actions";
import type { Member } from "@/lib/db";

type ItemWithSplits = ReceiptItem & {
  splitMemberIds: Set<number>;
};

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
  const [paidBy, setPaidBy] = useState<number | null>(null);
  const [receiptName, setReceiptName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isScanning, startScan] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function compressImage(file: File, maxDimension = 1536, quality = 0.8): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        if (width <= maxDimension && height <= maxDimension && file.size <= 1024 * 1024) {
          resolve(file);
          return;
        }
        const scale = Math.min(maxDimension / width, maxDimension / height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            resolve(new File([blob!], file.name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    compressImage(f).then((compressed) => {
      setFile(compressed);
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(compressed);
    });
  }

  function handleScan() {
    if (!file) return;
    const formData = new FormData();
    formData.set("image", file);

    startScan(async () => {
      const result = await scanReceiptClaude(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setItems(
          result.items.map((item) => ({
            ...item,
            splitMemberIds: new Set(members.map((m) => m.id)),
          }))
        );
        setError(null);
      }
    });
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

  function handleSubmit() {
    if (!items || !paidBy) return;
    startSubmit(async () => {
      await createExpensesFromReceipt(
        groupId,
        paidBy,
        items.map((item) => ({
          name: item.name,
          price: item.price,
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
    setPaidBy(null);
    setReceiptName("");
    setError(null);
  }

  const total = items?.reduce((s, i) => s + i.price, 0) ?? 0;

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
                  {/* Upload area */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
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
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-12 text-center hover:border-primary/50 hover:bg-muted/50 transition-all"
                    >
                      <Camera className="size-8 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">
                        Tap to take a photo or upload
                      </p>
                    </button>
                  )}

                  {error && (
                    <p className="text-sm text-destructive text-center">{error}</p>
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
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      Paid by
                    </label>
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
                              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
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
                              className="text-muted-foreground hover:text-destructive p-1.5"
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          {/* Split selection per item */}
                          <div className="flex flex-wrap gap-1.5">
                            {members.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => toggleItemSplit(idx, m.id)}
                                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
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

                  {/* Total & submit */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-sm font-medium text-muted-foreground">Total</span>
                    <span className="text-lg font-heading font-bold tabular-nums">
                      &euro;{total.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setItems(null);
                        setError(null);
                      }}
                      className="flex-1 h-12 rounded-xl text-base"
                    >
                      Re-scan
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={!paidBy || items.length === 0 || isSubmitting}
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
