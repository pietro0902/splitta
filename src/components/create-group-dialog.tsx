"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Users, Sparkles } from "lucide-react";
import { createGroup } from "@/lib/actions";
import { Button } from "@/components/ui/button";

const EMOJIS = ["👥", "🏠", "✈️", "🍕", "🎉", "💼", "🏖️", "🎵", "🚗", "🛒"];

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [memberInput, setMemberInput] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function addMember() {
    const trimmed = memberInput.trim();
    if (trimmed && !members.includes(trimmed)) {
      setMembers([...members, trimmed]);
      setMemberInput("");
    }
  }

  function removeMember(name: string) {
    setMembers(members.filter((m) => m !== name));
  }

  function handleSubmit() {
    if (!name.trim() || members.length < 2) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("emoji", emoji);
    formData.set("members", members.join(","));
    startTransition(async () => { await createGroup(formData); });
  }

  function reset() {
    setName("");
    setEmoji("👥");
    setMemberInput("");
    setMembers([]);
    setOpen(false);
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(true)}
        className="group relative flex items-center gap-3 rounded-2xl border-2 border-dashed border-border px-6 py-5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground hover:bg-accent/50"
      >
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
          <Plus className="size-5" />
        </div>
        <div className="text-left">
          <p className="font-heading text-base font-semibold">New Group</p>
          <p className="text-sm opacity-70">Start splitting expenses</p>
        </div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && reset()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md rounded-3xl bg-card border border-border p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  <h2 className="font-heading text-xl font-bold">Create Group</h2>
                </div>
                <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                  <X className="size-5" />
                </button>
              </div>

              <div className="space-y-5">
                {/* Emoji picker */}
                <div className="flex gap-2 flex-wrap">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={`size-10 rounded-xl text-lg flex items-center justify-center transition-all ${
                        emoji === e
                          ? "bg-primary/15 ring-2 ring-primary scale-110"
                          : "bg-muted hover:bg-accent"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>

                {/* Group name */}
                <input
                  type="text"
                  placeholder="Group name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 font-heading text-lg font-semibold placeholder:text-muted-foreground/50 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                />

                {/* Members */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Users className="size-3.5" />
                    Members ({members.length})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add a member..."
                      value={memberInput}
                      onChange={(e) => setMemberInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMember())}
                      className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                    <Button onClick={addMember} size="lg" variant="secondary">
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <AnimatePresence>
                    {members.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        className="flex flex-wrap gap-2 mt-3"
                      >
                        {members.map((m) => (
                          <motion.span
                            key={m}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                          >
                            {m}
                            <button
                              onClick={() => removeMember(m)}
                              className="hover:text-destructive transition-colors"
                            >
                              <X className="size-3" />
                            </button>
                          </motion.span>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {members.length < 2 && members.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Add at least 2 members</p>
                  )}
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={!name.trim() || members.length < 2 || isPending}
                  className="w-full h-12 rounded-xl text-base font-semibold"
                >
                  {isPending ? "Creating..." : "Create Group"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
