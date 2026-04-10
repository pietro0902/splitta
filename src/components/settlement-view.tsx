"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2, History, Trash2, Check } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { recordSettlement, deleteSettlementRecord } from "@/lib/actions";
import type { Settlement, SettlementRecord } from "@/lib/db-types";

export function SettlementView({
  settlements,
  settlementRecords,
  groupId,
}: {
  settlements: Settlement[];
  settlementRecords: SettlementRecord[];
  groupId: number;
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="space-y-5">
      {/* Pending settlements */}
      {settlements.length === 0 ? (
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 py-4">
          <CheckCircle2 className="size-5" />
          <span className="font-medium text-sm">All settled up!</span>
        </div>
      ) : (
        <div className="space-y-3">
          {settlements.map((s, i) => (
            <SettlementCard key={`${s.from.id}-${s.to.id}`} settlement={s} groupId={groupId} index={i} />
          ))}
        </div>
      )}

      {/* History toggle */}
      {settlementRecords.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="size-4" />
            Payment history ({settlementRecords.length})
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2">
                  {settlementRecords.map((r) => (
                    <SettlementRecordRow key={r.id} record={r} groupId={groupId} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function SettlementCard({
  settlement: s,
  groupId,
  index,
}: {
  settlement: Settlement;
  groupId: number;
  index: number;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSettle() {
    startTransition(async () => {
      await recordSettlement(groupId, s.from.id, s.to.id, s.amount);
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <MemberAvatar name={s.from.name} color={s.from.color} size="sm" />
      <span className="text-sm font-medium truncate">{s.from.name}</span>
      <div className="flex items-center gap-1 text-primary">
        <ArrowRight className="size-4" />
        <span className="font-heading font-bold text-sm tabular-nums">
          &euro;{s.amount.toFixed(2)}
        </span>
        <ArrowRight className="size-4" />
      </div>
      <span className="text-sm font-medium truncate">{s.to.name}</span>
      <MemberAvatar name={s.to.name} color={s.to.color} size="sm" />
      <button
        onClick={handleSettle}
        disabled={isPending}
        className="ml-auto shrink-0 flex items-center gap-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1.5 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
      >
        <Check className="size-3.5" />
        {isPending ? "..." : "Paid"}
      </button>
    </motion.div>
  );
}

function SettlementRecordRow({ record: r, groupId }: { record: SettlementRecord; groupId: number }) {
  const [isPending, startTransition] = useTransition();
  const date = new Date(r.created_at + "Z");
  const formattedDate = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="group flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
      <MemberAvatar name={r.from_name} color={r.from_color} size="sm" />
      <span className="text-xs font-medium truncate">{r.from_name}</span>
      <ArrowRight className="size-3 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium truncate">{r.to_name}</span>
      <MemberAvatar name={r.to_name} color={r.to_color} size="sm" />
      <span className="ml-auto text-xs font-heading font-bold tabular-nums shrink-0">
        &euro;{r.amount.toFixed(2)}
      </span>
      <span className="text-[10px] text-muted-foreground shrink-0">{formattedDate}</span>
      <button
        onClick={() => {
          if (confirm("Delete this payment record?")) {
            startTransition(() => deleteSettlementRecord(r.id, groupId));
          }
        }}
        disabled={isPending}
        className="sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
