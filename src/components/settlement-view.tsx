"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { recordSettlement, deleteSettlementRecord } from "@/lib/actions";
import { formatMoney } from "@/lib/money";
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
      {settlements.length === 0 ? (
        <div className="rounded-xl border border-ok-border bg-ok-field px-4 py-3.5 text-sm text-ok-foreground">
          Tutto in pari, non c&apos;è niente da saldare.
        </div>
      ) : (
        <div>
          <h3 className="mb-2.5 text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Chi paga chi
          </h3>
          <div className="space-y-2">
            {settlements.map((s) => (
              <SettlementCard key={`${s.from.id}-${s.to.id}`} settlement={s} groupId={groupId} />
            ))}
          </div>
          {/* The greedy matching produces the fewest transfers that close the
              group; saying how many turns that from a list into a plan. */}
          <p className="mt-3 text-xs text-muted-foreground">
            {settlements.length === 1
              ? "1 movimento per chiudere tutto"
              : `${settlements.length} movimenti per chiudere tutto`}
          </p>
        </div>
      )}

      {settlementRecords.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pagamenti registrati ({settlementRecords.length})
          </button>

          {showHistory && (
            <div className="mt-3 divide-y divide-hairline">
              {settlementRecords.map((r) => (
                <SettlementRecordRow key={r.id} record={r} groupId={groupId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettlementCard({ settlement: s, groupId }: { settlement: Settlement; groupId: number }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3">
      <MemberAvatar name={s.from.name} color={s.from.color} size="sm" />
      <span className="truncate text-sm">{s.from.name}</span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
      <MemberAvatar name={s.to.name} color={s.to.color} size="sm" />
      <span className="truncate text-sm">{s.to.name}</span>
      <span className="figure ml-auto shrink-0 text-sm font-medium">
        {formatMoney(s.amount_cents)}
      </span>
      <button
        onClick={() =>
          startTransition(async () => {
            await recordSettlement(groupId, s.from.id, s.to.id, s.amount_cents);
          })
        }
        disabled={isPending}
        className="shrink-0 rounded-full border border-brand-border px-2.5 py-1 text-xs text-primary transition-colors hover:bg-brand-field disabled:opacity-50"
      >
        {isPending ? "…" : "Salda"}
      </button>
    </div>
  );
}

function SettlementRecordRow({ record: r, groupId }: { record: SettlementRecord; groupId: number }) {
  const [isPending, startTransition] = useTransition();
  const formattedDate = new Date(r.created_at + "Z").toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="group flex items-center gap-2 py-2.5">
      <MemberAvatar name={r.from_name} color={r.from_color} size="sm" />
      <span className="truncate text-xs">{r.from_name}</span>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
      <MemberAvatar name={r.to_name} color={r.to_color} size="sm" />
      <span className="truncate text-xs">{r.to_name}</span>
      <span className="figure ml-auto shrink-0 text-xs">{formatMoney(r.amount_cents)}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{formattedDate}</span>
      <button
        onClick={() => {
          if (confirm("Eliminare questo pagamento registrato?")) {
            startTransition(() => deleteSettlementRecord(r.id, groupId));
          }
        }}
        disabled={isPending}
        aria-label="Elimina il pagamento"
        className="shrink-0 rounded-lg p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
