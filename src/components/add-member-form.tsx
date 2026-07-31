"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { addMember } from "@/lib/actions";

// Lives under the balance list, which is the one screen that already answers
// "who is in this group". Closed, it is a dashed row that stays out of the way;
// the group's own people are the content, and adding one is a rare act.
export function AddMemberForm({ groupId }: { groupId: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setName("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      // The server decides the colour and rejects a duplicate name; both are
      // things this form would only get wrong by guessing.
      const result = await addMember(groupId, trimmed);
      if (result?.error) {
        setError(result.error);
        return;
      }
      close();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="size-4" />
        Aggiungi una persona
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Come si chiama?"
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          className="shrink-0 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isPending ? "…" : "Aggiungi"}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Annulla"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4.5" />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-negative">{error}</p>}
      {/* Said before it happens, not discovered afterwards: a new member owes
          nothing towards anything already recorded. */}
      <p className="mt-2 text-xs text-muted-foreground">
        Parte da zero: non entra nelle spese già registrate.
      </p>
    </form>
  );
}
