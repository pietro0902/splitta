"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { BrandMark } from "@/components/brand-mark";
import { joinGroup } from "@/lib/actions";
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
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-2.5 px-5 py-4">
        <BrandMark size={26} className="text-primary" />
        <span className="text-[17px] font-medium tracking-[-0.02em]">Splitta</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm">
          <div className="rounded-[22px] border border-border bg-raised p-6 text-center">
            <span className="mb-3 block text-4xl">{group.emoji}</span>
            <h1 className="text-xl font-medium">{group.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.members.length === 1 ? "1 membro" : `${group.members.length} membri`}
            </p>

            {alreadyJoined ? (
              <div className="mt-7 space-y-4">
                <div className="flex items-center justify-center gap-2 text-positive">
                  <Check className="size-4.5" />
                  <span className="text-sm">Sei già in questo gruppo</span>
                </div>
                <button
                  onClick={() => router.push(`/groups/${group.id}`)}
                  className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Vai al gruppo
                </button>
              </div>
            ) : (
              <div className="mt-7">
                <p className="mb-3 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Chi sei?
                </p>
                <div className="grid gap-2">
                  {group.members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleJoin(m.id)}
                      disabled={isPending}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left text-sm transition-colors hover:border-primary disabled:opacity-50"
                    >
                      <MemberAvatar name={m.name} color={m.color} size="md" />
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>
                {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
