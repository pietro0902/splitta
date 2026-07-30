"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users, Check } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { joinGroup } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import type { Group, Member } from "@/lib/db-types";

type GroupWithMembers = Group & { members: Member[] };

export function InviteClient({
  group,
  token,
  alreadyJoined,
}: {
  group: GroupWithMembers;
  token: string;
  alreadyJoined: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // "Who are you?" is finally recorded: joinGroup stores the answer on the
  // access row, which is what makes the invite token mean something. It used to
  // be discarded, and joining was a localStorage write the server never saw.
  function handleJoin(memberId: number) {
    setError(null);
    startTransition(async () => {
      const result = await joinGroup(token, memberId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/groups/${result.groupId}`);
    });
  }

  return (
    <div className="relative flex flex-col flex-1">
      <main className="flex-1 flex items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-sm"
        >
          <div className="rounded-3xl border border-border bg-card p-8 shadow-2xl text-center">
            <span className="text-5xl mb-4 block">{group.emoji}</span>
            <h1 className="font-heading text-2xl font-bold mb-1">{group.name}</h1>
            <p className="text-sm text-muted-foreground mb-8">
              {group.members.length} members
            </p>

            {alreadyJoined ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Check className="size-5" />
                  <span className="font-medium">Already in your groups</span>
                </div>
                <Button
                  onClick={() => router.push(`/groups/${group.id}`)}
                  className="w-full h-12 rounded-xl text-base font-semibold"
                >
                  Go to group
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-muted-foreground flex items-center justify-center gap-1.5 mb-4">
                    <Users className="size-3.5" />
                    Who are you?
                  </label>
                  <div className="grid gap-2">
                    {group.members.map((m) => (
                      <motion.button
                        key={m.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleJoin(m.id)}
                        disabled={isPending}
                        className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-left font-medium bg-muted/50 hover:bg-primary/10 hover:ring-2 hover:ring-primary transition-all disabled:opacity-50"
                      >
                        <MemberAvatar name={m.name} color={m.color} size="md" />
                        <span>{m.name}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
