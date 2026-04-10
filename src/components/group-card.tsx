"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { MemberAvatarStack } from "@/components/member-avatar";
import { deleteGroup } from "@/lib/actions";
import { removeGroupId } from "@/lib/local-groups";
import { useTransition } from "react";
import type { GroupSummary } from "@/lib/db-types";

export function GroupCard({ group, index }: { group: GroupSummary; index: number }) {
  const [isPending, startTransition] = useTransition();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: "spring", damping: 20 }}
    >
      <Link href={`/groups/${group.id}`} className="block group">
        <div className="relative rounded-2xl border border-border bg-card p-5 transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{group.emoji}</span>
              <div>
                <h3 className="font-heading text-lg font-bold group-hover:text-primary transition-colors">
                  {group.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {group.members.length} members
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm("Delete this group?")) {
                  removeGroupId(group.id);
                  startTransition(() => deleteGroup(group.id));
                }
              }}
              disabled={isPending}
              className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total spent</p>
              <p className="font-heading text-2xl font-bold tabular-nums">
                &euro;{group.totalExpenses.toFixed(2)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <MemberAvatarStack members={group.members} />
              <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
