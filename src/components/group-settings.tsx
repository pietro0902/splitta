"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2, X, LogOut, Trash2 } from "lucide-react";
import { SheetOverlay } from "@/components/ui/sheet-overlay";
import { MemberAvatar } from "@/components/member-avatar";
import { updateGroup, removeMember, leaveGroup, deleteGroup } from "@/lib/actions";
import { GROUP_EMOJIS } from "@/lib/db-types";
import type { Group, Member } from "@/lib/db-types";

// Everything about a group that used to be decided once and then frozen: its
// name, its emoji, who is in it, and whether you are still in it yourself.
export function GroupSettings({
  group,
  members,
  myMemberId,
}: {
  group: Group;
  members: Member[];
  myMemberId: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji || "👥");
  const [error, setError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<{ id: number; message: string } | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isLeaving, startLeave] = useTransition();

  const dirty = name.trim() !== group.name || emoji !== (group.emoji || "👥");

  function close() {
    setOpen(false);
    setName(group.name);
    setEmoji(group.emoji || "👥");
    setError(null);
    setMemberError(null);
  }

  function handleSave() {
    setError(null);
    startSave(async () => {
      const result = await updateGroup(group.id, name, emoji);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  function handleRemove(member: Member) {
    setMemberError(null);
    startSave(async () => {
      const result = await removeMember(group.id, member.id);
      if (result?.error) setMemberError({ id: member.id, message: result.error });
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Impostazioni del gruppo"
        className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Settings2 className="size-4.5" />
      </button>

      <AnimatePresence>
        {open && (
          <SheetOverlay onClose={close}>
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] border border-border bg-raised p-5 pb-8 sm:max-w-md sm:rounded-[22px] sm:pb-5"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />

              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-medium">Impostazioni</h2>
                <button
                  onClick={close}
                  aria-label="Chiudi"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4.5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome del gruppo"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex flex-wrap gap-2">
                    {GROUP_EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => setEmoji(e)}
                        className={`flex size-10 items-center justify-center rounded-xl text-lg transition-colors ${
                          emoji === e ? "bg-brand-field ring-1 ring-primary" : "bg-muted hover:bg-secondary"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  {error && <p className="text-xs text-negative">{error}</p>}
                  {dirty && (
                    <button
                      onClick={handleSave}
                      disabled={isSaving || !name.trim()}
                      className="flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {isSaving ? "Salvataggio…" : "Salva"}
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    Chi c&apos;è
                  </h3>
                  <div className="divide-y divide-hairline">
                    {members.map((m) => (
                      <div key={m.id}>
                        <div className="flex items-center gap-3 py-2.5">
                          <MemberAvatar name={m.name} color={m.color} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {m.name}
                            {m.id === myMemberId && (
                              <span className="ml-1.5 text-xs text-muted-foreground">tu</span>
                            )}
                          </span>
                          <button
                            onClick={() => handleRemove(m)}
                            disabled={isSaving}
                            aria-label={`Togli ${m.name}`}
                            className="shrink-0 rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                        {memberError?.id === m.id && (
                          <p className="pb-2.5 text-xs text-negative">{memberError.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Si può togliere solo chi non ha ancora spese o pareggi.
                  </p>
                </div>

                <div className="space-y-2 border-t border-border pt-5">
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Uscire da "${group.name}"?\n\nIl gruppo resta agli altri e le tue spese non si toccano. Per rientrare ti serve di nuovo il link d'invito.`
                        )
                      ) {
                        startLeave(async () => {
                          await leaveGroup(group.id);
                          router.push("/");
                        });
                      }
                    }}
                    disabled={isLeaving}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <LogOut className="size-4" />
                    Esci dal gruppo
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Eliminare "${group.name}"?\n\nCancella il gruppo e tutte le sue spese per chiunque ne faccia parte, non solo su questo dispositivo. Non si può annullare.`
                        )
                      ) {
                        startLeave(async () => {
                          await deleteGroup(group.id);
                          router.push("/");
                        });
                      }
                    }}
                    disabled={isLeaving}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                    Elimina il gruppo
                  </button>
                </div>
              </div>
            </motion.div>
          </SheetOverlay>
        )}
      </AnimatePresence>
    </>
  );
}
