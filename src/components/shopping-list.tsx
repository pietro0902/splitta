"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import {
  addShoppingItem,
  toggleShoppingItem,
  deleteShoppingItem,
  clearCheckedShoppingItems,
} from "@/lib/actions";
import type { ShoppingItem } from "@/lib/db-types";

export function ShoppingList({
  items,
  groupId,
  myMemberId = null,
}: {
  items: ShoppingItem[];
  groupId: number;
  myMemberId?: number | null;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isClearPending, startClearTransition] = useTransition();

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("groupId", String(groupId));
    formData.set("name", name.trim());
    if (quantity.trim()) formData.set("quantity", quantity.trim());
    // The action has always accepted and validated this; nothing ever sent it,
    // so every row rendered "l'ha aggiunto …" for a name that was always null.
    if (myMemberId !== null) formData.set("addedByMemberId", String(myMemberId));
    startTransition(async () => {
      await addShoppingItem(formData);
      setName("");
      setQuantity("");
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Cosa serve…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <input
          type="text"
          placeholder="Qtà"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-16 rounded-xl border border-border bg-background px-3 py-2.5 text-center text-sm placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          aria-label="Aggiungi alla lista"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="size-5" />
        </button>
      </form>

      {items.length === 0 && (
        <div className="rounded-2xl border border-border bg-raised px-5 py-10 text-center">
          <p className="font-medium">La lista è vuota</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Segna quello che serve comprare.
          </p>
        </div>
      )}

      {unchecked.length > 0 && (
        <div className="divide-y divide-hairline">
          {unchecked.map((item) => (
            <ShoppingItemRow key={item.id} item={item} groupId={groupId} />
          ))}
        </div>
      )}

      {checked.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Presi ({checked.length})
            </span>
            <button
              onClick={() => startClearTransition(() => clearCheckedShoppingItems(groupId))}
              disabled={isClearPending}
              className="text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              {isClearPending ? "Pulizia…" : "Svuota"}
            </button>
          </div>
          <div className="divide-y divide-hairline opacity-55">
            {checked.map((item) => (
              <ShoppingItemRow key={item.id} item={item} groupId={groupId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShoppingItemRow({ item, groupId }: { item: ShoppingItem; groupId: number }) {
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  return (
    <div className="group flex items-center gap-3 py-2.5">
      <button
        onClick={() => startToggle(() => toggleShoppingItem(item.id, !item.checked, groupId))}
        disabled={isToggling}
        aria-label={item.checked ? "Segna come da prendere" : "Segna come preso"}
        className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          item.checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:border-primary"
        }`}
      >
        {item.checked && <Check className="size-3.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${item.checked ? "text-muted-foreground line-through" : ""}`}>
          {item.name}
        </p>
        {item.added_by_name && (
          <p className="text-[11px] text-muted-foreground">l&apos;ha aggiunto {item.added_by_name}</p>
        )}
      </div>

      {item.quantity && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {item.quantity}
        </span>
      )}

      <button
        onClick={() => {
          if (confirm("Togliere questa voce?")) {
            startDelete(() => deleteShoppingItem(item.id, groupId));
          }
        }}
        disabled={isDeleting}
        aria-label="Togli la voce"
        className="shrink-0 rounded-lg p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
