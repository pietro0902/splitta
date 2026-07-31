import { getMyGroups } from "@/lib/my-groups";
import { GroupList } from "@/components/group-list";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";

export const dynamic = "force-dynamic";

export default async function Home() {
  // No cookie means no groups: a first-time visitor renders the empty state,
  // and the id is minted when they create a group or redeem an invite.
  const groups = await getMyGroups();

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Below `lg` this is the only place the wordmark appears; above it the
          sidebar already carries one, and a second is just noise. */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} className="text-primary" />
            <h1 className="text-xl font-medium tracking-[-0.02em]">Splitta</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-5 lg:max-w-5xl lg:px-8 lg:py-8">
        <GroupList groups={groups} />
      </main>
    </div>
  );
}
