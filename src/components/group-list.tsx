import { GroupCard } from "@/components/group-card";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { formatMoney } from "@/lib/money";
import type { GroupSummary } from "@/lib/db-types";

// A server component: `groups` is already only the caller's, filtered by the
// query in db.getGroups. This used to receive every group in the database and
// narrow it client-side against localStorage, which meant the loading skeleton
// existed purely to hide that round trip -- and the unfiltered list was in the
// HTML the whole time.
export function GroupList({ groups }: { groups: GroupSummary[] }) {
  return (
    <>
      {groups.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">
            {groups.length} {groups.length === 1 ? "group" : "groups"} &middot;{" "}
            {formatMoney(groups.reduce((s, g) => s + g.totalExpensesCents, 0))} total
          </p>
        </div>
      )}

      <div className="grid gap-4">
        {groups.map((group, i) => (
          <GroupCard key={group.id} group={group} index={i} />
        ))}
        <CreateGroupDialog />
      </div>

      {groups.length === 0 && (
        <div className="text-center mt-12">
          <p className="text-5xl mb-4">💸</p>
          <h2 className="font-heading text-2xl mb-2">No groups yet</h2>
          <p className="text-muted-foreground max-w-xs mx-auto">
            Create a group and start splitting expenses with your friends.
          </p>
        </div>
      )}
    </>
  );
}
