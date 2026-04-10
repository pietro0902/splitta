"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, X } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import {
  addShoppingItem,
  toggleShoppingItem,
  deleteShoppingItem,
  clearCheckedShoppingItems,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import type { Member, ShoppingItem } from "@/lib/db-types";

export function ShoppingList({
  items,
  groupId,
  members,
}: {
  items: ShoppingItem[];
  groupId: number;
  members: Member[];
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
    startTransition(async () => {
      await addShoppingItem(formData);
      setName("");
      setQuantity("");
    });
  }

  return (
    <div className="space-y-4">
      {/* Add item form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Add item..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
        />
        <input
          type="text"
          placeholder="Qty"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-16 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-center placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
        />
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          className="flex items-center justify-center size-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
        >
          <Plus className="size-5" />
        </button>
      </form>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-medium">Shopping list is empty</p>
          <p className="text-sm mt-1">Add items you need to buy</p>
        </div>
      )}

      {/* Unchecked items */}
      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {unchecked.map((item) => (
            <ShoppingItemRow key={item.id} item={item} groupId={groupId} />
          ))}
        </AnimatePresence>
      </div>

      {/* Checked items */}
      {checked.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              Completed ({checked.length})
            </span>
            <button
              onClick={() => startClearTransition(() => clearCheckedShoppingItems(groupId))}
              disabled={isClearPending}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              {isClearPending ? "Clearing..." : "Clear all"}
            </button>
          </div>
          <div className="space-y-1.5 opacity-50">
            <AnimatePresence initial={false}>
              {checked.map((item) => (
                <ShoppingItemRow key={item.id} item={item} groupId={groupId} />
              ))}
            </AnimatePresence>
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
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <button
        onClick={() => startToggle(() => toggleShoppingItem(item.id, !item.checked, groupId))}
        disabled={isToggling}
        className={`size-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
          item.checked
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border hover:border-primary/50"
        }`}
      >
        {item.checked && (
          <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.checked ? "line-through text-muted-foreground" : ""}`}>
          {item.name}
        </p>
        {item.added_by_name && (
          <p className="text-[11px] text-muted-foreground">
            added by {item.added_by_name}
          </p>
        )}
      </div>

      {item.quantity && (
        <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground shrink-0">
          {item.quantity}
        </span>
      )}

      <button
        onClick={() => {
          if (confirm("Remove this item?")) {
            startDelete(() => deleteShoppingItem(item.id, groupId));
          }
        }}
        disabled={isDeleting}
        className="sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
      >
        <Trash2 className="size-3.5" />
      </button>
    </motion.div>
  );
}
