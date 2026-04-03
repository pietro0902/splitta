import { db } from "@/lib/db";
import { GroupCard } from "@/components/group-card";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const groups = await db.getGroups();

  return (
    <div className="relative flex flex-col flex-1">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Receipt className="size-4.5" />
            </div>
            <h1 className="font-heading text-2xl font-normal tracking-tight">
              Splitta
            </h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        {groups.length > 0 && (
          <div className="mb-6">
            <p className="text-sm text-muted-foreground">
              {groups.length} {groups.length === 1 ? "group" : "groups"} &middot;{" "}
              &euro;{groups.reduce((s, g) => s + g.totalExpenses, 0).toFixed(2)} total
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
      </main>
    </div>
  );
}
