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
  if (groups.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-raised px-5 py-8 text-center">
          <h2 className="text-lg font-medium">Non hai ancora gruppi</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
            Crea un gruppo e inizia a dividere le spese con i tuoi amici.
          </p>
        </div>
        <div className="mt-4">
          <CreateGroupDialog />
        </div>
      </>
    );
  }

  // Your position across everything, which is the number people open the app
  // for. Groups where this browser never said which member it is contribute
  // nothing -- their balance is unknown, not zero -- so they are counted out of
  // the headline as well as out of the sum.
  const known = groups.filter((g) => g.myBalanceCents !== null);
  const net = known.reduce((s, g) => s + (g.myBalanceCents ?? 0), 0);
  const open = known.filter((g) => g.myBalanceCents !== 0).length;
  const totalSpent = groups.reduce((s, g) => s + g.totalExpensesCents, 0);

  // Being square is a state, not an amount, so it says so in words -- putting
  // the group's total spend under a "Sei in pari" label was the figure and the
  // label describing different things.
  //
  // A net of zero is also not the same as having nothing to do: owed €100 in
  // one group and owing €100 in another cancels out while leaving two payments
  // to make. That case says "in pari nel totale", and the "2 da saldare" chip
  // below it is then a clarification rather than a contradiction.
  const allSettled = known.length > 0 && open === 0;
  const square = known.length > 0 && net === 0;
  const label =
    known.length === 0
      ? "Totale speso"
      : net > 0
        ? "Ti devono"
        : net < 0
          ? "Devi"
          : allSettled
            ? "Sei in pari"
            : "In pari nel totale";
  const headline = square ? "in pari" : formatMoney(known.length === 0 ? totalSpent : Math.abs(net));
  const headlineColor =
    known.length === 0 || square ? "" : net > 0 ? "text-positive" : "text-negative";

  return (
    <>
      <section className="rounded-2xl border border-border bg-raised p-5">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className={`figure mt-1.5 text-[36px] leading-none font-medium ${headlineColor}`}>
          {headline}
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          {open > 0 && (
            <span className="rounded-full border border-brand-border bg-brand-field px-2.5 py-1 text-xs text-primary">
              {open === 1 ? "1 da saldare" : `${open} da saldare`}
            </span>
          )}
          <span className="rounded-full border border-brand-border bg-brand-field px-2.5 py-1 text-xs text-primary">
            {groups.length === 1 ? "1 gruppo" : `${groups.length} gruppi`}
          </span>
          {known.length === 0 && (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              dì chi sei per vedere il tuo saldo
            </span>
          )}
        </div>
      </section>

      <div className="mt-4">
        <CreateGroupDialog />
      </div>

      <h2 className="mt-7 mb-2.5 text-xs uppercase tracking-[0.08em] text-muted-foreground">
        I tuoi gruppi
      </h2>
      <div className="grid gap-2">
        {groups.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    </>
  );
}
