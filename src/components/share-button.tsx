"use client";

import { useState, useTransition } from "react";
import { Share2, Check } from "lucide-react";
import { getInviteToken } from "@/lib/actions";

export function ShareButton({
  groupId,
  inviteToken,
}: {
  groupId: number;
  inviteToken: string | null;
}) {
  const [token, setToken] = useState(inviteToken);
  const [copied, setCopied] = useState(false);
  const [isLoading, startTransition] = useTransition();

  function handleClick() {
    if (token) {
      shareOrCopy(token);
      return;
    }
    startTransition(async () => {
      const t = await getInviteToken(groupId);
      setToken(t);
      shareOrCopy(t);
    });
  }

  async function shareOrCopy(t: string) {
    const url = `${window.location.origin}/invite/${t}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my Splitta group", url });
      } catch {
        // user cancelled share dialog
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="flex size-9 items-center justify-center rounded-xl bg-card border border-border hover:bg-accent transition-colors"
    >
      {copied ? (
        <Check className="size-4 text-primary" />
      ) : (
        <Share2 className="size-4" />
      )}
    </button>
  );
}
