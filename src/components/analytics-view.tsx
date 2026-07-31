"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { MemberAvatar } from "@/components/member-avatar";
import { CURRENCY, formatMoney } from "@/lib/money";
import { tintField } from "@/lib/tints";
import { expenseDate, parseStored } from "@/lib/dates";
import {
  countExpenseEntries,
  entryAmountCents,
  groupExpenses,
  receiptPayers,
} from "@/lib/receipts";
import type { Member, Expense } from "@/lib/db-types";

function payerSummary(payers: Expense["payers"]): string {
  return payers.map((p) => p.member_name).join(" e ");
}

const TOOLTIP_STYLE = {
  borderRadius: "12px",
  border: "1px solid var(--border)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: "13px",
} as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>
  );
}

export function AnalyticsView({
  expenses,
  members,
}: {
  expenses: Expense[];
  members: Member[];
}) {
  if (expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-raised px-5 py-10 text-center">
        <p className="font-medium">Ancora niente da mostrare</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggiungi qualche spesa e qui compaiono i numeri.
        </p>
      </div>
    );
  }

  // Every `amount` below is cents, so the sums are exact and the rounding that
  // used to follow each one is gone. Only the average needs rounding, being the
  // one figure here that isn't a sum.
  const total = expenses.reduce((s, e) => s + e.amount_cents, 0);
  // Entries, not rows: a receipt is one expense that happens to be stored as N.
  // Counting rows made this card read 269 while the list below it showed 123,
  // and dragged the average down by the same factor.
  const count = countExpenseEntries(expenses);
  const avg = Math.round(total / count);

  // Spending per member (who paid)
  const paidByMember = members.map((m) => {
    const amount = expenses.reduce((s, e) => {
      const paid = e.payers.find((p) => p.member_id === m.id);
      return s + (paid?.amount_cents ?? 0);
    }, 0);
    return { member: m, amount };
  }).sort((a, b) => b.amount - a.amount);

  // Cost per member (what they owe based on splits)
  const costByMember = members.map((m) => {
    const amount = expenses.reduce((s, e) => {
      const split = e.splits.find((sp) => sp.member_id === m.id);
      return s + (split?.amount_cents ?? 0);
    }, 0);
    return { member: m, amount };
  }).sort((a, b) => b.amount - a.amount);

  // Spending over time (by day)
  const byDay = new Map<string, number>();
  for (const e of expenses) {
    // The day it was spent, not the day it was typed: otherwise a week of
    // receipts entered on Sunday evening reads as one enormous Sunday.
    const day = parseStored(expenseDate(e)).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
    });
    byDay.set(day, (byDay.get(day) || 0) + e.amount_cents);
  }
  const dailyData = Array.from(byDay.entries())
    .map(([day, amount]) => ({ day, amount }))
    .reverse();

  // Top expenses, ranked over receipts rather than their line items: a weekly
  // shop is one €87 expense, not twelve chances for "CAROTE CPQ IT" to place
  // in a group's five biggest.
  const topExpenses = groupExpenses(expenses)
    .map((entry) =>
      entry.type === "single"
        ? {
            key: `e${entry.expense.id}`,
            label: entry.expense.description,
            payers: entry.expense.payers,
            amount: entry.expense.amount_cents,
          }
        : {
            key: `r${entry.receiptId}`,
            label: entry.expenses[0].receipt_name || "Scontrino",
            payers: receiptPayers(entry.expenses),
            amount: entryAmountCents(entry),
          }
    )
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const pieData = paidByMember.filter((d) => d.amount > 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-border bg-card p-3.5 text-center">
          <p className="mb-1 text-xs text-muted-foreground">Totale</p>
          <p className="figure text-[17px] font-medium">{formatMoney(total)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 text-center">
          <p className="mb-1 text-xs text-muted-foreground">Spese</p>
          <p className="figure text-[17px] font-medium">{count}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3.5 text-center">
          <p className="mb-1 text-xs text-muted-foreground">Media</p>
          <p className="figure text-[17px] font-medium">{formatMoney(avg)}</p>
        </div>
      </div>

      {pieData.length > 0 && (
        <div>
          <SectionTitle>Chi ha pagato</SectionTitle>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="amount"
                  nameKey="member.name"
                  strokeWidth={0}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.member.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [formatMoney(Number(value)), "ha pagato"]}
                  labelFormatter={(_, payload) => payload[0]?.payload?.member?.name ?? ""}
                  contentStyle={TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {pieData.map((d) => (
              <div key={d.member.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: d.member.color }} />
                {d.member.name}: <span className="figure">{formatMoney(d.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Quanto è costato a ciascuno</SectionTitle>
        <div className="space-y-2">
          {costByMember.map((d) => {
            const pct = total > 0 ? (d.amount / total) * 100 : 0;
            return (
              <div key={d.member.id} className="flex items-center gap-3">
                <MemberAvatar name={d.member.name} color={d.member.color} size="sm" />
                <span className="w-20 truncate text-sm">{d.member.name}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-lg bg-muted">
                  <div
                    className="h-full rounded-lg"
                    style={{ width: `${pct}%`, backgroundColor: tintField(d.member.color, 55) }}
                  />
                </div>
                <span className="figure w-20 text-right text-sm">{formatMoney(d.amount)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {dailyData.length > 1 && (
        <div>
          <SectionTitle>Spesa nel tempo</SectionTitle>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  // Whole euros: an axis tick has no room for the cents.
                  tickFormatter={(v) => `${CURRENCY}${Math.round(Number(v) / 100)}`}
                  width={50}
                />
                <Tooltip
                  formatter={(value) => [formatMoney(Number(value)), "speso"]}
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="amount" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Le spese più grandi</SectionTitle>
        <div className="divide-y divide-hairline">
          {topExpenses.map((e, i) => (
            <div key={e.key} className="flex items-center gap-3 py-2.5">
              <span className="figure w-4 text-sm text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{e.label}</p>
                <p className="truncate text-xs text-muted-foreground">{payerSummary(e.payers)}</p>
              </div>
              <p className="figure text-sm">{formatMoney(e.amount)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
