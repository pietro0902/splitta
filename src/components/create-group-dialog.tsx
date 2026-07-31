"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, UserCheck } from "lucide-react";
import { SheetOverlay } from "@/components/ui/sheet-overlay";
import { createGroup } from "@/lib/actions";
import { GROUP_EMOJIS } from "@/lib/db-types";

export function CreateGroupDialog({
  // "rail" is the sidebar's quiet text button; the default is the full-width
  // accent pill the homepage leads with.
  variant = "pill",
}: {
  variant?: "pill" | "rail";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [memberInput, setMemberInput] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [meIndex, setMeIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function addMember() {
    const trimmed = memberInput.trim();
    if (trimmed && !members.includes(trimmed)) {
      setMembers([...members, trimmed]);
      setMemberInput("");
    }
  }

  function removeMember(name: string) {
    const removed = members.indexOf(name);
    setMembers(members.filter((m) => m !== name));
    // "Who is you" is an index into this list, so removing a name above it
    // would otherwise silently reassign you to somebody else.
    if (meIndex === null || removed === -1) return;
    if (meIndex === removed) setMeIndex(null);
    else if (meIndex > removed) setMeIndex(meIndex - 1);
  }

  function handleSubmit() {
    if (!name.trim() || members.length < 2) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("emoji", emoji);
    formData.set("members", members.join(","));
    if (meIndex !== null) formData.set("me", String(meIndex));
    startTransition(async () => {
      const result = await createGroup(formData);
      // The action records the creator's access server-side, so there is
      // nothing left to write on this device.
      if (result && "groupId" in result && result.groupId) {
        router.push(`/groups/${result.groupId}`);
      }
    });
  }

  function reset() {
    setName("");
    setEmoji("👥");
    setMemberInput("");
    setMembers([]);
    setMeIndex(null);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === "rail"
            ? "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            : "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 active:translate-y-px"
        }
      >
        <Plus className={variant === "rail" ? "size-4" : "size-4.5"} />
        Nuovo gruppo
      </button>

      <AnimatePresence>
        {open && (
          <SheetOverlay onClose={reset}>
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[22px] border border-border bg-raised p-5 pb-8 sm:rounded-[22px] sm:pb-5"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-medium">Nuovo gruppo</h2>
                <button
                  onClick={reset}
                  aria-label="Chiudi"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4.5" />
                </button>
              </div>

              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {GROUP_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={`flex size-10 items-center justify-center rounded-xl text-lg transition-colors ${
                        emoji === e
                          ? "bg-brand-field ring-1 ring-primary"
                          : "bg-muted hover:bg-secondary"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Nome del gruppo…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    Membri ({members.length})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Aggiungi una persona…"
                      value={memberInput}
                      onChange={(e) => setMemberInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMember())}
                      className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      onClick={addMember}
                      aria-label="Aggiungi"
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-primary transition-colors hover:bg-muted"
                    >
                      <Plus className="size-4.5" />
                    </button>
                  </div>
                  {members.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {members.map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand-border bg-brand-field px-3 py-1.5 text-sm text-primary"
                        >
                          {m}
                          <button
                            onClick={() => removeMember(m)}
                            aria-label={`Togli ${m}`}
                            className="transition-colors hover:text-destructive"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {members.length > 0 && members.length < 2 && (
                    <p className="mt-2 text-xs text-muted-foreground">Servono almeno 2 persone</p>
                  )}
                </div>

                {/* Which of those names is you. The server otherwise knows you
                    may open this group but not who you are inside it, and every
                    "you owe / you are owed" figure depends on that answer. */}
                {members.length > 0 && (
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      <UserCheck className="size-3.5" />
                      E tu chi sei?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {members.map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMeIndex(meIndex === i ? null : i)}
                          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                            meIndex === i
                              ? "bg-brand-field text-primary ring-1 ring-primary"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!name.trim() || members.length < 2 || isPending}
                  className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {isPending ? "Creazione…" : "Crea gruppo"}
                </button>
              </div>
            </motion.div>
          </SheetOverlay>
        )}
      </AnimatePresence>
    </>
  );
}
