"use client";

import { useTransition } from "react";
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
    <div className="mb-4 rounded-2xl border border-brand-border bg-brand-field p-4">
      <p className="text-sm font-medium">Chi sei, in questo gruppo?</p>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">
        Dillo e il gruppo può mostrarti quanto devi e quanto ti devono.
      </p>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => startTransition(() => void claimMemberIdentity(groupId, m.id))}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pl-1.5 pr-3 text-sm transition-colors hover:border-primary disabled:opacity-50"
          >
            <MemberAvatar name={m.name} color={m.color} size="sm" />
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
