import { getMyGroups } from "@/lib/my-groups";
import { Sidebar } from "@/components/sidebar";

// Everything that belongs to a signed-in-ish browser: the homepage and the
// groups. `/invite/[token]` is deliberately outside this group -- it is the one
// screen a stranger sees, and a rail listing somebody else's groups has no
// business on it.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The same query the homepage runs, deduplicated with it by `cache` — so the
  // rail costs nothing on `/` and two round trips on a group page.
  const groups = await getMyGroups();

  return (
    <div className="flex flex-1 lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <Sidebar groups={groups} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
