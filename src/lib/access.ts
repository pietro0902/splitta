// Authorization checks. Every read of a group and every mutation of anything
// inside one goes through here.
//
// The Next.js docs are explicit that a proxy/matcher is not a place to enforce
// this: server actions are POSTs to whatever route they were used on, so a
// refactor that moves one can silently drop it out of a matcher. The check has
// to live in the action itself, which is what `assertAccess` is for.
import { notFound } from "next/navigation";
import { db } from "./db";
import { getClientId } from "./session";

// For server components. A group the caller may not see is indistinguishable
// from one that does not exist -- otherwise walking /groups/1, /groups/2, ...
// still reveals how many groups the deployment holds.
export async function requireAccess(groupId: number): Promise<string> {
  const clientId = await getClientId();
  if (!clientId || !(await db.hasAccess(groupId, clientId))) notFound();
  return clientId;
}

// For server actions. Throws rather than returning `{ error }` like the
// validation failures do: a legitimate client cannot reach this state, so
// there is no message the UI could usefully show and no input to correct.
export async function assertAccess(groupId: number): Promise<string> {
  const clientId = await getClientId();
  if (!clientId || !(await db.hasAccess(groupId, clientId))) {
    throw new Error("Not a member of this group");
  }
  return clientId;
}

// Member ids arrive from the client as plain integers in a form payload, so
// being a member of the group is not enough -- a caller could still name
// somebody from a different group as the payer, which would write a split that
// no view of either group can explain. Every id has to belong to this group.
export async function assertMembersInGroup(
  groupId: number,
  memberIds: number[]
): Promise<void> {
  if (memberIds.length === 0) return;
  const known = new Set(await db.getMemberIds(groupId));
  for (const id of memberIds) {
    if (!known.has(id)) throw new Error("Unknown member for this group");
  }
}

// Same idea for the actions that address expenses by id (edit, delete, and the
// receipt editor, which rewrites a whole batch of them at once).
export async function assertExpensesInGroup(
  groupId: number,
  expenseIds: number[]
): Promise<void> {
  if (expenseIds.length === 0) return;
  const found = new Set(await db.filterExpenseIdsInGroup(groupId, expenseIds));
  for (const id of expenseIds) {
    if (!found.has(id)) throw new Error("Expense does not belong to this group");
  }
}
