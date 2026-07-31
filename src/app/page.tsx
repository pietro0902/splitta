import { db } from "@/lib/db";
import { getClientId } from "@/lib/session";
import { GroupList } from "@/components/group-list";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";

export const dynamic = "force-dynamic";

export default async function Home() {
  // No cookie means no groups: a first-time visitor renders the empty state,
  // and the id is minted when they create a group or redeem an invite.
  const clientId = await getClientId();
  const groups = clientId ? await db.getGroups(clientId) : [];

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} className="text-primary" />
            <h1 className="text-xl font-medium tracking-[-0.02em]">Splitta</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-5">
        <GroupList groups={groups} />
      </main>
    </div>
  );
}
