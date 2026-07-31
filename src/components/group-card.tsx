"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteGroup } from "@/lib/actions";
import { formatMoney } from "@/lib/money";
import { groupTint, initials } from "@/lib/tints";
import { useTransition } from "react";
import type { GroupSummary } from "@/lib/db-types";

// A group is a row, not a card: what it leads with is *your* position, because
// nobody opens this app to ask what the group spent in total. That figure is
// still here, but it is the fallback for a browser that never said which member
// it is -- and a group whose balance is unknown says so rather than showing a
// confident zero.
//
// The emoji survives the redesign. The mockups replaced it with a coloured
// monogram, which is cleaner, but people picked those emoji by hand; this keeps
// them and puts them in the tinted tile the monogram would have used.
export function GroupCard({ group }: { group: GroupSummary }) {
  const [isPending, startTransition] = useTransition();
  const balance = group.myBalanceCents;

  return (
    <div className="group relative flex items-center gap-3 rounded-xl border border-border bg-card pr-2 transition-colors hover:border-brand-border">
      <Link href={`/groups/${group.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-medium"
          style={groupTint(group.name)}
        >
          {group.emoji || initials(group.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-tight">{group.name}</span>
          <span className="block text-xs text-muted-foreground">
            {group.members.length === 1 ? "1 membro" : `${group.members.length} membri`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {balance === null ? (
            <>
              <span className="figure block text-sm text-muted-foreground">
                {formatMoney(group.totalExpensesCents)}
              </span>
              <span className="block text-[11px] text-muted-foreground">totale</span>
            </>
          ) : balance === 0 ? (
            <span className="block text-sm text-muted-foreground">saldato</span>
          ) : (
            <>
              <span
                className={`figure block text-sm font-medium ${balance > 0 ? "text-positive" : "text-negative"}`}
              >
                {balance > 0 ? "+" : "−"}
                {formatMoney(Math.abs(balance))}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {balance > 0 ? "ti devono" : "devi"}
              </span>
            </>
          )}
        </span>
      </Link>
      <button
        onClick={() => {
          if (
            confirm(
              `Eliminare "${group.name}"?\n\nCancella il gruppo e tutte le sue spese per chiunque ne faccia parte, non solo su questo dispositivo. Non si può annullare.`
            )
          ) {
            // The access rows cascade with the group, so deleting it removes it
            // from every member's homepage, not just this one.
            startTransition(() => {
              void deleteGroup(group.id);
            });
          }
        }}
        disabled={isPending}
        aria-label={`Elimina ${group.name}`}
        className="shrink-0 rounded-lg p-2 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
