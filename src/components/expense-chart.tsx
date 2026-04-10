"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { Member, Expense } from "@/lib/db-types";

export function ExpenseChart({
  expenses,
  members,
}: {
  expenses: Expense[];
  members: Member[];
}) {
  const spendingByMember = members.map((m) => {
    const total = expenses
      .filter((e) => e.paid_by_member_id === m.id)
      .reduce((sum, e) => sum + e.amount, 0);
    return { name: m.name, value: Math.round(total * 100) / 100, color: m.color };
  }).filter((d) => d.value > 0);

  if (spendingByMember.length === 0) return null;

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={spendingByMember}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
          >
            {spendingByMember.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [`€${Number(value).toFixed(2)}`, "Paid"]}
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
        {spendingByMember.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="size-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}
