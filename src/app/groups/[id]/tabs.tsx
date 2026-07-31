"use client";

import { useState, type ReactNode } from "react";

const TABS = [
  { id: "expenses", label: "Spese" },
  { id: "balances", label: "Saldi" },
  { id: "settle", label: "Pareggi" },
  { id: "shopping", label: "Lista" },
  { id: "stats", label: "Stats" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// A scrolling row of pills rather than five equal segments in a tray. The tray
// forced every label to fit the narrowest phone, which is why the labels were
// stacked under icons at 10px; pills size to their text and the row scrolls.
export function GroupTabs({
  expensesTab,
  balancesTab,
  settlementsTab,
  shoppingTab,
  analyticsTab,
  expenseCount,
  shoppingCount,
}: {
  expensesTab: ReactNode;
  balancesTab: ReactNode;
  settlementsTab: ReactNode;
  shoppingTab: ReactNode;
  analyticsTab: ReactNode;
  expenseCount: number;
  shoppingCount: number;
}) {
  const [active, setActive] = useState<TabId>("expenses");

  return (
    <div>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {TABS.map((tab) => {
          const badge =
            (tab.id === "expenses" && expenseCount > 0 && expenseCount) ||
            (tab.id === "shopping" && shoppingCount > 0 && shoppingCount) ||
            null;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors ${
                isActive
                  ? "border border-brand-border bg-brand-field text-primary"
                  : "border border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {badge && (
                <span
                  className={`figure text-[11px] ${isActive ? "text-primary/70" : "text-muted-foreground/70"}`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {active === "expenses" && expensesTab}
        {active === "balances" && balancesTab}
        {active === "settle" && settlementsTab}
        {active === "shopping" && shoppingTab}
        {active === "stats" && analyticsTab}
      </div>
    </div>
  );
}
