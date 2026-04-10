import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShareButton } from "@/components/share-button";
import { AddExpenseForm } from "@/components/add-expense-form";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { ExpenseList } from "@/components/expense-list";
import { BalanceDisplay } from "@/components/balance-display";
import { SettlementView } from "@/components/settlement-view";
import { AnalyticsView } from "@/components/analytics-view";
import { ShoppingList } from "@/components/shopping-list";
import { AutoClaimGroup } from "@/components/auto-claim-group";
import { GroupTabs } from "./tabs";

export default async function GroupPage(props: PageProps<"/groups/[id]">) {
  const { id } = await props.params;
  const group = await db.getGroup(Number(id));
  if (!group) notFound();

  const [balances, settlements, settlementRecords, shoppingItems] = await Promise.all([
    db.getBalances(group.id),
    db.getSettlements(group.id),
    db.getSettlementRecords(group.id),
    db.getShoppingItems(group.id),
  ]);

  const uncheckedShoppingCount = shoppingItems.filter((i) => !i.checked).length;

  return (
    <div className="relative flex flex-col flex-1">
      <AutoClaimGroup groupId={group.id} />
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <Link
              href="/"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card border border-border hover:bg-accent transition-colors"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-heading text-lg sm:text-xl font-normal tracking-tight flex items-center gap-1.5 sm:gap-2">
                <span className="shrink-0">{group.emoji}</span>
                <span className="truncate">{group.name}</span>
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                {group.members.length} members &middot; &euro;{group.totalExpenses.toFixed(2)} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ShareButton groupId={group.id} inviteToken={group.invite_token} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <div className="mb-6 flex gap-3">
          <div className="flex-1">
            <AddExpenseForm groupId={group.id} members={group.members} />
          </div>
          <ReceiptScanner groupId={group.id} members={group.members} />
        </div>

        <GroupTabs
          expensesTab={
            <ExpenseList expenses={group.expenses} groupId={group.id} members={group.members} />
          }
          balancesTab={<BalanceDisplay balances={balances} />}
          settlementsTab={
            <SettlementView
              settlements={settlements}
              settlementRecords={settlementRecords}
              groupId={group.id}
            />
          }
          shoppingTab={
            <ShoppingList items={shoppingItems} groupId={group.id} members={group.members} />
          }
          analyticsTab={<AnalyticsView expenses={group.expenses} members={group.members} />}
          expenseCount={group.expenses.length}
          shoppingCount={uncheckedShoppingCount}
        />
      </main>
    </div>
  );
}
