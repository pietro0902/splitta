"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import type { Settlement } from "@/lib/db";

export function SettlementView({ settlements }: { settlements: Settlement[] }) {
  if (settlements.length === 0) {
    return (
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 py-4">
        <CheckCircle2 className="size-5" />
        <span className="font-medium text-sm">All settled up!</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {settlements.map((s, i) => (
        <motion.div
          key={`${s.from.id}-${s.to.id}`}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
        >
          <MemberAvatar name={s.from.name} color={s.from.color} size="sm" />
          <span className="text-sm font-medium truncate">{s.from.name}</span>
          <div className="flex items-center gap-1 text-primary">
            <ArrowRight className="size-4" />
            <span className="font-heading font-bold text-sm tabular-nums">
              &euro;{s.amount.toFixed(2)}
            </span>
            <ArrowRight className="size-4" />
          </div>
          <span className="text-sm font-medium truncate">{s.to.name}</span>
          <MemberAvatar name={s.to.name} color={s.to.color} size="sm" />
        </motion.div>
      ))}
    </div>
  );
}
