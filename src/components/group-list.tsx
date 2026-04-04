"use client";

import { useState, useEffect } from "react";
import { GroupCard } from "@/components/group-card";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { getMyGroupIds } from "@/lib/local-groups";
import type { GroupSummary } from "@/lib/db";

export function GroupList({ groups }: { groups: GroupSummary[] }) {
  const [myIds, setMyIds] = useState<number[] | null>(null);

  useEffect(() => {
    setMyIds(getMyGroupIds());
  }, []);

  // Loading state (before localStorage is read)
  if (myIds === null) {
    return (
      <div className="grid gap-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-card p-5 animate-pulse h-32"
          />
        ))}
        <CreateGroupDialog />
      </div>
    );
  }

  const myGroups = groups.filter((g) => myIds.includes(g.id));

  return (
    <>
      {myGroups.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">
            {myGroups.length} {myGroups.length === 1 ? "group" : "groups"} &middot;{" "}
            &euro;{myGroups.reduce((s, g) => s + g.totalExpenses, 0).toFixed(2)} total
          </p>
        </div>
      )}

      <div className="grid gap-4">
        {myGroups.map((group, i) => (
          <GroupCard key={group.id} group={group} index={i} />
        ))}
        <CreateGroupDialog />
      </div>

      {myGroups.length === 0 && (
        <div className="text-center mt-12">
          <p className="text-5xl mb-4">💸</p>
          <h2 className="font-heading text-2xl mb-2">No groups yet</h2>
          <p className="text-muted-foreground max-w-xs mx-auto">
            Create a group and start splitting expenses with your friends.
          </p>
        </div>
      )}
    </>
  );
}
