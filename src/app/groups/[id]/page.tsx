import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { formatMoney } from "@/lib/money";
import { countExpenseEntries } from "@/lib/receipts";

export const dynamic = "force-dynamic";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShareButton } from "@/components/share-button";
import { AddExpenseForm } from "@/components/add-expense-form";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { ExpenseList } from "@/components/expense-list";
import { BalanceDisplay } from "@/components/balance-display";
import { SettlementView } from "@/components/settlement-view";
import { AnalyticsView } from "@/components/analytics-view";
import { ShoppingList } from "@/components/shopping-list";
import { IdentityPrompt } from "@/components/identity-prompt";
import { AddMemberForm } from "@/components/add-member-form";
import { GroupSettings } from "@/components/group-settings";
import { GroupTabs } from "./tabs";

export default async function GroupPage(props: PageProps<"/groups/[id]">) {
  const { id } = await props.params;
  // Reading a group requires having redeemed its invite. Previously this page
  // rendered on the sequential integer id alone and then claimed the group into
  // the visitor's list on mount, so walking /groups/1, /groups/2, ... read every
  // group in the deployment and added them all to the walker's own homepage.
  const clientId = await requireAccess(Number(id));

  const group = await db.getGroup(Number(id));
  if (!group) notFound();

  // Null when this browser never said which member it is. Everything
  // personalised depends on the answer, so the page asks for it.
  const myMemberId = await db.getAccessMemberId(group.id, clientId);

  const [balances, settlements, settlementRecords, shoppingItems] = await Promise.all([
    db.getBalances(group.id),
    db.getSettlements(group.id),
    db.getSettlementRecords(group.id),
    db.getShoppingItems(group.id),
  ]);

  const uncheckedShoppingCount = shoppingItems.filter((i) => !i.checked).length;
  const myBalance = balances.find((b) => b.member.id === myMemberId)?.balance_cents ?? null;

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-3 sm:px-5">
          <Link
            href="/"
            aria-label="Torna ai gruppi"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="flex min-w-0 flex-1 items-center gap-2 text-[17px] font-medium tracking-[-0.01em]">
            <span className="shrink-0">{group.emoji}</span>
            <span className="truncate">{group.name}</span>
          </h1>
          <div className="flex shrink-0 items-center gap-0.5">
            <ShareButton groupId={group.id} inviteToken={group.invite_token} />
            <GroupSettings group={group} members={group.members} myMemberId={myMemberId} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* pb-24 keeps the last row clear of the action bar below. */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-5 pb-24">
        {myMemberId === null && (
          <IdentityPrompt groupId={group.id} members={group.members} />
        )}

        {/* Your position first, the group's total second. The old header had it
            the other way round, and nobody opens a group to ask what everyone
            spent in total. */}
        <section className="mb-5 flex items-end justify-between gap-4 rounded-2xl border border-border bg-raised p-5">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              {myBalance === null ? "Totale gruppo" : "Il tuo saldo"}
            </p>
            <p
              className={`figure mt-1.5 text-[32px] leading-none font-medium ${
                myBalance === null || myBalance === 0
                  ? ""
                  : myBalance > 0
                    ? "text-positive"
                    : "text-negative"
              }`}
            >
              {myBalance === null
                ? formatMoney(group.totalExpensesCents)
                : myBalance === 0
                  ? "in pari"
                  : `${myBalance > 0 ? "+" : "−"}${formatMoney(Math.abs(myBalance))}`}
            </p>
            {myBalance !== null && myBalance !== 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {myBalance > 0 ? "ti devono" : "devi"}
              </p>
            )}
          </div>
          {myBalance !== null && (
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">Totale gruppo</p>
              <p className="figure text-sm">{formatMoney(group.totalExpensesCents)}</p>
            </div>
          )}
        </section>

        <GroupTabs
          expensesTab={
            <ExpenseList
              expenses={group.expenses}
              groupId={group.id}
              members={group.members}
              myMemberId={myMemberId}
            />
          }
          balancesTab={
            <>
              <BalanceDisplay balances={balances} myMemberId={myMemberId} />
              <AddMemberForm groupId={group.id} />
            </>
          }
          settlementsTab={
            <SettlementView
              settlements={settlements}
              settlementRecords={settlementRecords}
              groupId={group.id}
            />
          }
          shoppingTab={
            <ShoppingList items={shoppingItems} groupId={group.id} myMemberId={myMemberId} />
          }
          analyticsTab={<AnalyticsView expenses={group.expenses} members={group.members} />}
          expenseCount={countExpenseEntries(group.expenses)}
          shoppingCount={uncheckedShoppingCount}
        />
      </main>

      {/* Both ways of adding money sit within thumb reach, above the fold edge,
          instead of at the top where the old form pushed the list down. */}
      <div className="sticky bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex-1">
            {/* Keyed on the membership so adding somebody remounts the form.
                Its "diviso tra" default is `useState(new Set(members))`, read
                once at mount, so without this a member added a moment ago is
                absent from the next expense's split until the page reloads. */}
            <AddExpenseForm
              key={group.members.map((m) => m.id).join(",")}
              groupId={group.id}
              members={group.members}
            />
          </div>
          <ReceiptScanner groupId={group.id} members={group.members} />
        </div>
      </div>
    </div>
  );
}
