"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { formatMoney } from "@/lib/money";
import { groupTint, initials } from "@/lib/tints";
import type { GroupSummary } from "@/lib/db-types";

// Desktop only, and deliberately so: on a phone the group list *is* the
// homepage and a permanent rail would eat a third of the screen. Above `lg`
// there is room for it, and it turns "go back, then pick another group" into
// one click -- which is the whole reason the desktop layout is worth having.
//
// The groups come from the (app) layout, so the query is shared by every screen
// inside it. Which one is current comes from the pathname rather than a prop:
// a layout only receives params for its own dynamic segments, and this one has
// none -- it sits above `groups/[id]`, not inside it.
export function Sidebar({ groups }: { groups: GroupSummary[] }) {
  const pathname = usePathname();
  const activeGroupId = Number(pathname.match(/^\/groups\/(\d+)/)?.[1]);

  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-border lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-4">
        <BrandMark size={26} className="text-primary" />
        <span className="text-[17px] font-medium tracking-[-0.02em]">Splitta</span>
      </Link>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p className="px-2 py-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
          I tuoi gruppi
        </p>
        <ul className="space-y-0.5">
          {groups.map((group) => {
            const active = group.id === activeGroupId;
            const balance = group.myBalanceCents;
            return (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors ${
                    active ? "bg-brand-field text-primary" : "hover:bg-muted"
                  }`}
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-[9px] text-xs"
                    style={groupTint(group.name)}
                  >
                    {group.emoji || initials(group.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{group.name}</span>
                  {balance !== null && balance !== 0 && (
                    <span
                      className={`figure shrink-0 text-[11px] ${
                        balance > 0 ? "text-positive" : "text-negative"
                      }`}
                    >
                      {balance > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(balance))}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Opens the real dialog. It used to be a link to `/`, which said "new
          group" and delivered you to the homepage to press another button. */}
      <div className="flex items-center justify-between border-t border-border px-3 py-3">
        <CreateGroupDialog variant="rail" />
        <ThemeToggle />
      </div>
    </aside>
  );
}
