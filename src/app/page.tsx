import { db } from "@/lib/db";
import { getClientId } from "@/lib/session";
import { GroupList } from "@/components/group-list";
import { ThemeToggle } from "@/components/theme-toggle";
import { Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  // No cookie means no groups: a first-time visitor renders the empty state,
  // and the id is minted when they create a group or redeem an invite.
  const clientId = await getClientId();
  const groups = clientId ? await db.getGroups(clientId) : [];

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
        <GroupList groups={groups} />
      </main>
    </div>
  );
}
