"use client";

import { motion } from "framer-motion";
import { MemberAvatar } from "@/components/member-avatar";
import { formatMoney } from "@/lib/money";
import type { Member } from "@/lib/db-types";

type BalanceData = { member: Member; balance_cents: number };

export function BalanceDisplay({ balances }: { balances: BalanceData[] }) {
  if (balances.length === 0) return null;
  const maxAbs = Math.max(...balances.map((b) => Math.abs(b.balance_cents)), 1);

  return (
    <div className="space-y-3">
      {balances.map((b, i) => {
        const pct = Math.abs(b.balance_cents) / maxAbs;
        const isPositive = b.balance_cents > 0;
        const isNegative = b.balance_cents < 0;
        return (
          <motion.div
            key={b.member.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3"
          >
            <MemberAvatar name={b.member.name} color={b.member.color} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate">{b.member.name}</span>
                <span
                  className={`text-sm font-heading font-bold tabular-nums ${
                    isPositive ? "text-emerald-600 dark:text-emerald-400" : isNegative ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                  }`}
                >
                  {isPositive ? "+" : ""}{formatMoney(b.balance_cents)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ delay: i * 0.05 + 0.2, type: "spring", damping: 20 }}
                  className={`h-full rounded-full ${
                    isPositive
                      ? "bg-emerald-500"
                      : isNegative
                      ? "bg-rose-500"
                      : "bg-muted-foreground"
                  }`}
                />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
