import { MemberAvatar } from "@/components/member-avatar";
import { formatMoney } from "@/lib/money";
import type { Member } from "@/lib/db-types";

type BalanceData = { member: Member; balance_cents: number };

// Mint and coral come from the theme, not from Tailwind's emerald/rose: the
// direction gives "you are owed" and "you owe" their own two colours, and the
// brand cyan deliberately means neither.
export function BalanceDisplay({
  balances,
  myMemberId = null,
}: {
  balances: BalanceData[];
  myMemberId?: number | null;
}) {
  if (balances.length === 0) return null;
  const maxAbs = Math.max(...balances.map((b) => Math.abs(b.balance_cents)), 1);

  return (
    <div className="space-y-3.5">
      {balances.map((b) => {
        const pct = (Math.abs(b.balance_cents) / maxAbs) * 100;
        const positive = b.balance_cents > 0;
        const settled = b.balance_cents === 0;
        return (
          <div key={b.member.id} className="flex items-center gap-3">
            <MemberAvatar name={b.member.name} color={b.member.color} />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">
                  {b.member.name}
                  {b.member.id === myMemberId && (
                    <span className="ml-1.5 text-xs text-muted-foreground">tu</span>
                  )}
                </span>
                <span
                  className={`figure shrink-0 text-sm ${
                    settled ? "text-muted-foreground" : positive ? "text-positive" : "text-negative"
                  }`}
                >
                  {settled ? "saldato" : `${positive ? "+" : "−"}${formatMoney(Math.abs(b.balance_cents))}`}
                </span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${positive ? "bg-positive" : "bg-negative"}`}
                  style={{ width: settled ? "0%" : `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
