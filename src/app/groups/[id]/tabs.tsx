"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Receipt, TrendingUp, ArrowLeftRight } from "lucide-react";

const TABS = [
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "balances", label: "Balances", icon: TrendingUp },
  { id: "settle", label: "Settle Up", icon: ArrowLeftRight },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function GroupTabs({
  expensesTab,
  balancesTab,
  settlementsTab,
  expenseCount,
}: {
  expensesTab: ReactNode;
  balancesTab: ReactNode;
  settlementsTab: ReactNode;
  expenseCount: number;
}) {
  const [active, setActive] = useState<TabId>("expenses");

  return (
    <div>
      <div className="flex gap-1 rounded-2xl bg-muted p-1 mb-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className="relative flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
          >
            {active === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 rounded-xl bg-card shadow-sm"
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <tab.icon className="size-3.5" />
              {tab.label}
              {tab.id === "expenses" && expenseCount > 0 && (
                <span className="text-[10px] tabular-nums bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  {expenseCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <motion.div
        key={active}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {active === "expenses" && expensesTab}
        {active === "balances" && balancesTab}
        {active === "settle" && settlementsTab}
      </motion.div>
    </div>
  );
}
