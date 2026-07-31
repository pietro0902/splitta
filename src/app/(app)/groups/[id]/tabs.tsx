"use client";

import { useState, type ReactNode } from "react";

// A scrolling row of pills rather than five equal segments in a tray. The tray
// forced every label to fit the narrowest phone, which is why the labels were
// stacked under icons at 10px; pills size to their text and the row scrolls.
//
// Above `lg` the balances and the settle-up plan stop being tabs: they sit in
// their own column, permanently. There is no reason to hide them behind a click
// on a screen with room for both, and reading "chi paga chi" beside the expense
// that caused it is the whole argument for a desktop layout.
//
// The panels are still rendered exactly once. Doing this with a mobile tree and
// a desktop tree would put a group's eighty expense rows in the DOM twice; here
// the side column is a single element that moves, and the tab buttons for its
// contents disappear above `lg`.
const TABS = [
  { id: "expenses", label: "Spese", side: false },
  { id: "balances", label: "Saldi", side: true },
  { id: "settle", label: "Pareggi", side: true },
  { id: "shopping", label: "Lista", side: false },
  { id: "stats", label: "Stats", side: false },
] as const;

type TabId = (typeof TABS)[number]["id"];

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
  const sideActive = active === "balances" || active === "settle";

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-7">
      <div className="min-w-0">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:px-0">
          {TABS.map((tab) => {
            const badge =
              (tab.id === "expenses" && expenseCount > 0 && expenseCount) ||
              (tab.id === "shopping" && shoppingCount > 0 && shoppingCount) ||
              null;
            const isActive = active === tab.id;
            // Above `lg` a side tab is not in this row and the column shows the
            // expense list instead, so "Spese" is what is selected up there --
            // without this, widening the window while on "Saldi" leaves every
            // visible pill looking unselected.
            const activeAtLg = sideActive && tab.id === "expenses";
            return (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors ${
                  tab.side ? "lg:hidden" : ""
                } ${
                  isActive
                    ? "border border-brand-border bg-brand-field text-primary"
                    : "border border-transparent text-muted-foreground hover:text-foreground"
                } ${activeAtLg ? "lg:border-brand-border lg:bg-brand-field lg:text-primary" : ""}`}
              >
                {tab.label}
                {badge && (
                  <span
                    className={`figure text-[11px] ${isActive ? "text-primary/70" : "text-muted-foreground/70"} ${
                      activeAtLg ? "lg:text-primary/70" : ""
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Above `lg` the two side tabs cannot be reached from the row above, so
            their state falls back to the expense list rather than leaving this
            column blank after a resize. Under `lg` they *are* reachable and the
            aside below is the answer, so the fallback has to stay hidden --
            otherwise tapping "Saldi" on a phone puts eighty expense rows
            between the tap and the balances it asked for. */}
        <div className="mt-4">
          {active === "shopping" ? (
            shoppingTab
          ) : active === "stats" ? (
            analyticsTab
          ) : (
            <div className={sideActive ? "hidden lg:block" : undefined}>{expensesTab}</div>
          )}
        </div>
      </div>

      <aside
        className={`mt-6 space-y-7 lg:sticky lg:top-24 lg:mt-0 lg:block ${
          sideActive ? "block" : "hidden"
        }`}
      >
        <div className={active === "settle" ? "hidden lg:block" : ""}>
          <h3 className="mb-3 hidden text-xs uppercase tracking-[0.08em] text-muted-foreground lg:block">
            Saldi
          </h3>
          {balancesTab}
        </div>
        <div className={active === "balances" ? "hidden lg:block" : ""}>{settlementsTab}</div>
      </aside>
    </div>
  );
}
