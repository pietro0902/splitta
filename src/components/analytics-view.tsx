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
import { MemberAvatar, MemberAvatarStack } from "@/components/member-avatar";
import { CURRENCY, formatMoney } from "@/lib/money";
import type { Member, Expense } from "@/lib/db-types";

function payerSummary(payers: Expense["payers"]): string {
  return payers.map((p) => p.member_name).join(" & ");
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
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-4xl mb-3">📊</p>
        <p className="font-medium">No data yet</p>
        <p className="text-sm mt-1">Add expenses to see analytics</p>
      </div>
    );
  }

  // Every `amount` below is cents, so the sums are exact and the rounding that
  // used to follow each one is gone. Only the average needs rounding, being the
  // one figure here that isn't a sum.
  const total = expenses.reduce((s, e) => s + e.amount_cents, 0);
  const avg = Math.round(total / expenses.length);

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
    const day = new Date(e.created_at + "Z").toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
    byDay.set(day, (byDay.get(day) || 0) + e.amount_cents);
  }
  const dailyData = Array.from(byDay.entries())
    .map(([day, amount]) => ({ day, amount }))
    .reverse();

  // Top expenses
  const topExpenses = [...expenses]
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 5);

  // Pie data for who paid
  const pieData = paidByMember.filter((d) => d.amount > 0);

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total</p>
          <p className="font-heading text-lg font-bold tabular-nums">{formatMoney(total)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Expenses</p>
          <p className="font-heading text-lg font-bold tabular-nums">{expenses.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Average</p>
          <p className="font-heading text-lg font-bold tabular-nums">{formatMoney(avg)}</p>
        </div>
      </div>

      {/* Who paid - Pie chart */}
      {pieData.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Who paid</h3>
          <div className="h-48">
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
                  formatter={(value) => [formatMoney(Number(value)), "Paid"]}
                  labelFormatter={(_, payload) => payload[0]?.payload?.member?.name ?? ""}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    fontSize: "13px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
              {pieData.map((d) => (
                <div key={d.member.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="size-2.5 rounded-full" style={{ backgroundColor: d.member.color }} />
                  {d.member.name}: {formatMoney(d.amount)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cost per person */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Cost per person</h3>
        <div className="space-y-2">
          {costByMember.map((d) => {
            const pct = total > 0 ? (d.amount / total) * 100 : 0;
            return (
              <div key={d.member.id} className="flex items-center gap-3">
                <MemberAvatar name={d.member.name} color={d.member.color} size="sm" />
                <span className="text-sm font-medium w-20 truncate">{d.member.name}</span>
                <div className="flex-1 h-6 rounded-lg bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-all"
                    style={{ width: `${pct}%`, backgroundColor: d.member.color, opacity: 0.7 }}
                  />
                </div>
                <span className="text-sm font-heading font-bold tabular-nums w-20 text-right">
                  {formatMoney(d.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily spending bar chart */}
      {dailyData.length > 1 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Spending over time</h3>
          <div className="h-48">
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
                  formatter={(value) => [formatMoney(Number(value)), "Spent"]}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--card)",
                    fontSize: "13px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                />
                <Bar dataKey="amount" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top expenses */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Top expenses</h3>
        <div className="space-y-2">
          {topExpenses.map((e, i) => (
            <div
              key={e.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}</span>
              <MemberAvatarStack members={e.payers.map((p) => ({ name: p.member_name, color: p.member_color }))} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <p className="text-xs text-muted-foreground">{payerSummary(e.payers)}</p>
              </div>
              <p className="font-heading font-bold tabular-nums">{formatMoney(e.amount_cents)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
