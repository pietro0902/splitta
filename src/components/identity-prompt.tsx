"use client";

import { useTransition } from "react";
import { motion } from "framer-motion";
import { UserCheck } from "lucide-react";
import { claimMemberIdentity } from "@/lib/actions";
import { MemberAvatar } from "@/components/member-avatar";
import type { Member } from "@/lib/db-types";

// Shown on a group whose access row has no member_id: this browser is allowed
// in, but never said who it is. That happens for groups created before the
// creation form asked, and for anyone who skipped the question.
//
// Deliberately not a blocking modal. Not answering costs the personalised
// figures ("your balance", "your share"), not the ability to use the group, so
// it sits above the content and waits rather than demanding an answer first.
export function IdentityPrompt({
  groupId,
  members,
}: {
  groupId: number;
  members: Member[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 rounded-2xl border border-border bg-card p-4"
    >
      <p className="text-sm font-medium flex items-center gap-1.5">
        <UserCheck className="size-4 text-primary" />
        Which one is you?
      </p>
      <p className="text-xs text-muted-foreground mt-1 mb-3">
        Tell us and this group can show what you owe and what you are owed.
      </p>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => startTransition(() => void claimMemberIdentity(groupId, m.id))}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full bg-muted/50 hover:bg-primary/10 hover:ring-2 hover:ring-primary pl-1.5 pr-3 py-1.5 text-sm font-medium transition-all disabled:opacity-50"
          >
            <MemberAvatar name={m.name} color={m.color} size="sm" />
            {m.name}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
