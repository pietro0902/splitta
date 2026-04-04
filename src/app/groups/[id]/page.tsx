import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import Link from "next/link";
import { ArrowLeft, Users, TrendingUp, ArrowLeftRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShareButton } from "@/components/share-button";
import { AddExpenseForm } from "@/components/add-expense-form";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { ExpenseList } from "@/components/expense-list";
import { BalanceDisplay } from "@/components/balance-display";
import { SettlementView } from "@/components/settlement-view";
import { ExpenseChart } from "@/components/expense-chart";
import { GroupTabs } from "./tabs";

export default async function GroupPage(props: PageProps<"/groups/[id]">) {
  const { id } = await props.params;
  const group = await db.getGroup(Number(id));
  if (!group) notFound();

  const balances = await db.getBalances(group.id);
  const settlements = await db.getSettlements(group.id);

  return (
    <div className="relative flex flex-col flex-1">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex size-9 items-center justify-center rounded-xl bg-card border border-border hover:bg-accent transition-colors"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="font-heading text-xl font-normal tracking-tight flex items-center gap-2">
                <span>{group.emoji}</span>
                {group.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                {group.members.length} members &middot; &euro;{group.totalExpenses.toFixed(2)} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {group.expenses.length > 0 && (
          <div className="mb-8">
            <ExpenseChart expenses={group.expenses} members={group.members} />
          </div>
        )}

        <GroupTabs
          expensesTab={
            <ExpenseList expenses={group.expenses} groupId={group.id} />
          }
          balancesTab={<BalanceDisplay balances={balances} />}
          settlementsTab={<SettlementView settlements={settlements} />}
          expenseCount={group.expenses.length}
        />
      </main>
    </div>
  );
}
