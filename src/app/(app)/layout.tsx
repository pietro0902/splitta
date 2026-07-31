import { Suspense } from "react";
import { getMyGroups } from "@/lib/my-groups";
import { Sidebar } from "@/components/sidebar";

// Everything that belongs to a signed-in-ish browser: the homepage and the
// groups. `/invite/[token]` is deliberately outside this group -- it is the one
// screen a stranger sees, and a rail listing somebody else's groups has no
// business on it.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Awaited inside the boundary, not in the layout body. A layout that
          awaits holds back everything under it, so the rail's query sat in
          front of the group page's own loading skeleton -- and it is a query
          nobody below `lg` can see the result of, since the rail is
          `display:none` there. The fallback is the same empty column, so
          nothing moves when the groups land. */}
      <Suspense
        fallback={<div className="sticky top-0 hidden h-screen border-r border-border lg:block" />}
      >
        <SidebarRail />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

async function SidebarRail() {
  // The same query the homepage runs, deduplicated with it by `cache` — so the
  // rail costs nothing on `/` and two round trips on a group page.
  const groups = await getMyGroups();

  // Only what a row draws. `GroupSummary` would put every group's invite token
  // and full member list into the payload of a client component.
  return (
    <Sidebar
      groups={groups.map(({ id, name, emoji, myBalanceCents }) => ({
        id,
        name,
        emoji,
        myBalanceCents,
      }))}
    />
  );
}
