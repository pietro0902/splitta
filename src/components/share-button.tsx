"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Copy, Check, X } from "lucide-react";
import { getInviteToken } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function ShareButton({
  groupId,
  inviteToken,
}: {
  groupId: number;
  inviteToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(inviteToken);
  const [copied, setCopied] = useState(false);
  const [isLoading, startTransition] = useTransition();

  function getInviteUrl() {
    if (!token) return "";
    return `${window.location.origin}/invite/${token}`;
  }

  function handleOpen() {
    if (token) {
      setOpen(true);
      return;
    }
    startTransition(async () => {
      const t = await getInviteToken(groupId);
      setToken(t);
      setOpen(true);
    });
  }

  async function handleCopy() {
    const url = getInviteUrl();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    const url = getInviteUrl();
    if (navigator.share) {
      await navigator.share({ title: "Join my Splitta group", url });
    } else {
      handleCopy();
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={isLoading}
        className="flex size-9 items-center justify-center rounded-xl bg-card border border-border hover:bg-accent transition-colors"
      >
        <Share2 className="size-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
            onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-card border border-border p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Share2 className="size-5 text-primary" />
                  <h2 className="font-heading text-xl font-bold">Invite Link</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Share this link to invite people to the group.
              </p>

              <div className="flex items-center gap-2 mb-5">
                <input
                  type="text"
                  readOnly
                  value={getInviteUrl()}
                  className="flex-1 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm font-mono truncate focus:outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card hover:bg-accent transition-colors"
                >
                  {copied ? (
                    <Check className="size-4 text-primary" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>

              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button
                  onClick={handleShare}
                  className="w-full h-12 rounded-xl text-base font-semibold"
                >
                  <Share2 className="size-4 mr-2" />
                  Share
                </Button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
