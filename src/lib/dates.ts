// Dates, in the two forms this app has to hold at once: the day the money was
// spent (which the user chooses) and the instant the row was written (which the
// database chooses). Pure and client-safe.
//
// Stored timestamps are SQLite's "YYYY-MM-DD HH:MM:SS" in UTC. The "Z" appended
// on parsing is what makes them UTC rather than local -- without it a receipt
// scanned at 01:00 in Rome reads as the previous day.

type Dated = { spent_at?: string | null; created_at: string };

// The date an expense belongs to. Falls back to `created_at` for any row a
// migration or an older client left without one.
export function expenseDate(e: Dated): string {
  return e.spent_at || e.created_at;
}

export function parseStored(iso: string): Date {
  return new Date(iso.replace(" ", "T") + "Z");
}

// "18 lug" — the form used down the expense list.
export function formatDay(iso: string): string {
  return parseStored(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

// What `<input type="date">` wants: YYYY-MM-DD, in the user's own timezone.
export function toDateInput(iso: string): string {
  const d = parseStored(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function todayInput(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Turn the picker's value into what gets stored, or `undefined` to let the
// database stamp the current instant.
//
// Two things worth keeping: a date left on today is sent as nothing at all, so
// expenses entered today keep a real time of day and sort among themselves in
// the order they were added. And a chosen day is pinned at **noon** UTC, which
// is the only hour that survives being read back in any timezone from -11 to
// +12 without sliding onto the day before or after.
export function toSpentAt(value: string): string | undefined {
  if (!value || value === todayInput()) return undefined;
  return atNoon(value);
}

// Unconditional counterpart, for editing. There "today" is a real choice --
// moving an expense from last Tuesday to today has to be written, and going
// through `toSpentAt` would send nothing and silently leave it on Tuesday.
export function atNoon(value: string): string {
  return `${value} 12:00:00`;
}
