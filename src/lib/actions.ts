"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { computeSplits, splitsAreValid, SPLIT_MODES, type SplitInput, type SplitMode } from "@/lib/splits";
import { payersAreValid, distributePayersOverLines, type PayerInput } from "@/lib/payers";
import { assertAccess, assertExpensesInGroup, assertMembersInGroup } from "@/lib/access";
import { getOrCreateClientId } from "@/lib/session";
import { parseMoney } from "@/lib/money";

// Every action below that names a group starts with `assertAccess(groupId)`.
// Server actions are ordinary HTTP endpoints and group ids are sequential
// integers, so without it any caller can address any record in the database.

function parseSplitMode(raw: FormDataEntryValue | null): SplitMode {
  const value = String(raw ?? "equal");
  return (SPLIT_MODES.some((m) => m.id === value) ? value : "equal") as SplitMode;
}

export async function createGroup(formData: FormData) {
  const name = formData.get("name") as string;
  const emoji = (formData.get("emoji") as string) || "👥";
  const membersRaw = formData.get("members") as string;
  const memberNames = membersRaw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  if (!name || memberNames.length < 2) {
    return { error: "Name and at least 2 members are required" };
  }

  // The one place a brand-new visitor gets an identity, alongside redeeming an
  // invite. Both are actions, which is the only place a cookie can be set.
  const clientId = await getOrCreateClientId();
  const groupId = await db.createGroup(name, emoji, memberNames, clientId);
  revalidatePath("/");
  return { groupId };
}

export async function deleteGroup(groupId: number) {
  await assertAccess(groupId);
  await db.deleteGroup(groupId);
  revalidatePath("/");
}

// Join a group from its invite link. The token is the credential here -- it is
// what the holder of the link proves -- so this is the one action that grants
// access rather than checking it.
// The explicit return type keeps the two cases a real union: inferred, both
// branches pick up an optional counterpart field and `"error" in result` stops
// narrowing at the call site.
export async function joinGroup(
  token: string,
  memberId: number | null
): Promise<{ error: string } | { groupId: number }> {
  const group = await db.getGroupByToken(token);
  if (!group) return { error: "This invite link is no longer valid" };
  if (memberId !== null && !group.members.some((m) => m.id === memberId)) {
    return { error: "That person is not in this group" };
  }

  const clientId = await getOrCreateClientId();
  await db.grantAccess(group.id, clientId, memberId);
  revalidatePath("/");
  return { groupId: group.id };
}

// Amounts in these payloads are cents. They are rounded rather than trusted to
// already be integers: the sum checks below are exact equality now, so a
// fractional cent from a hand-rolled payload would fail confusingly instead of
// being rejected as the malformed input it is.
function parseSplits(raw: FormDataEntryValue | null): SplitInput[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({
        memberId: Number(s.memberId),
        amount: Math.round(Number(s.amount)),
        weight: s.weight === null || s.weight === undefined ? null : Number(s.weight),
      }))
      .filter((s) => s.memberId && Number.isFinite(s.amount) && s.amount > 0);
  } catch {
    return [];
  }
}

function parsePayers(raw: FormDataEntryValue | null): PayerInput[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({ memberId: Number(p.memberId), amount: Math.round(Number(p.amount)) }))
      .filter((p) => p.memberId && Number.isFinite(p.amount) && p.amount > 0);
  } catch {
    return [];
  }
}

// Payers and splits arrive as raw member ids, so they need checking against the
// group as well as against the total: naming a member of another group would
// write a row that neither group's balances can account for.
function referencedMemberIds(payers: PayerInput[], splits: SplitInput[]): number[] {
  return [...payers.map((p) => p.memberId), ...splits.map((s) => s.memberId)];
}

export async function addExpense(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const description = formData.get("description") as string;
  const amountCents = parseMoney(formData.get("amount") as string);
  const payers = parsePayers(formData.get("payers"));
  const splitMode = parseSplitMode(formData.get("splitMode"));
  const splits = parseSplits(formData.get("splits"));
  const category = (formData.get("category") as string) || undefined;

  await assertAccess(groupId);

  if (!description || !amountCents || payers.length === 0 || splits.length === 0) {
    return { error: "All fields are required" };
  }
  if (!payersAreValid(amountCents, payers)) {
    return { error: "The paid amounts do not add up to the total" };
  }
  if (!splitsAreValid(amountCents, splits)) {
    return { error: "The split does not add up to the total" };
  }
  await assertMembersInGroup(groupId, referencedMemberIds(payers, splits));

  await db.addExpense(groupId, description, amountCents, payers, splits, splitMode, undefined, undefined, category);
  revalidatePath(`/groups/${groupId}`);
}

export async function updateExpense(
  expenseId: number,
  groupId: number,
  description: string,
  amountCents: number,
  payers: PayerInput[],
  splits: SplitInput[],
  splitMode: SplitMode,
  category?: string
) {
  await assertAccess(groupId);

  if (!description || !amountCents || payers.length === 0 || splits.length === 0) {
    return { error: "All fields are required" };
  }
  if (!payersAreValid(amountCents, payers)) {
    return { error: "The paid amounts do not add up to the total" };
  }
  if (!splitsAreValid(amountCents, splits)) {
    return { error: "The split does not add up to the total" };
  }
  await assertExpensesInGroup(groupId, [expenseId]);
  await assertMembersInGroup(groupId, referencedMemberIds(payers, splits));

  await db.updateExpense(expenseId, groupId, description, amountCents, payers, splits, splitMode, category);
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteExpense(expenseId: number, groupId: number) {
  await assertAccess(groupId);
  await db.deleteExpense(expenseId, groupId);
  revalidatePath(`/groups/${groupId}`);
}

export async function addMember(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const name = formData.get("name") as string;
  const color = (formData.get("color") as string) || "#C4572A";

  await assertAccess(groupId);
  if (!name) return { error: "Name is required" };

  await db.addMember(groupId, name, color);
  revalidatePath(`/groups/${groupId}`);
}

export async function createExpensesFromReceipt(
  groupId: number,
  payers: PayerInput[],
  items: { name: string; priceCents: number; splitMemberIds: number[] }[],
  receiptName?: string,
  // One category for the whole receipt. This argument was simply missing, so
  // every line a scan ever created was stored uncategorised -- 167 of the 268
  // expenses in production, which is most of the money the analytics tab is
  // supposed to break down.
  category?: string
) {
  await assertAccess(groupId);

  const receiptId = crypto.randomUUID();
  const name = receiptName?.trim() || undefined;
  const valid = items.filter((i) => i.splitMemberIds.length > 0 && i.priceCents > 0);
  await assertMembersInGroup(groupId, [
    ...payers.map((p) => p.memberId),
    ...valid.flatMap((i) => i.splitMemberIds),
  ]);

  const payersByLine = distributePayersOverLines(payers, valid.map((i) => i.priceCents));
  for (let k = 0; k < valid.length; k++) {
    const item = valid[k];
    const { splits } = computeSplits("equal", item.priceCents, item.splitMemberIds, {});
    await db.addExpense(groupId, item.name, item.priceCents, payersByLine[k], splits, "equal", receiptId, name, category);
  }
  revalidatePath(`/groups/${groupId}`);
}

export async function renameReceipt(receiptId: string, name: string, groupId: number) {
  await assertAccess(groupId);
  await db.renameReceipt(receiptId, name.trim(), groupId);
  revalidatePath(`/groups/${groupId}`);
}

// Full edit of a scanned receipt: name, payer (applied to every line), and each
// line item (description, price, who it is split between). `originalIds` is the
// set of expense ids the receipt currently has, so removed lines get deleted.
// Receipt lines are always split equally; per-line custom splits stay available
// through the single-expense editor.
export async function saveReceipt(
  groupId: number,
  receiptId: string,
  receiptName: string,
  payers: PayerInput[],
  items: { id?: number; name: string; priceCents: number; splitMemberIds: number[]; category?: string }[],
  originalIds: number[]
) {
  await assertAccess(groupId);

  if (payers.length === 0) return { error: "Select who paid" };

  const valid = items.filter((i) => i.name.trim() && i.priceCents > 0 && i.splitMemberIds.length > 0);
  if (valid.length === 0) return { error: "Add at least one item" };

  await assertMembersInGroup(groupId, [
    ...payers.map((p) => p.memberId),
    ...valid.flatMap((i) => i.splitMemberIds),
  ]);
  // Both the lines being rewritten and the ones being removed are client-supplied ids.
  await assertExpensesInGroup(groupId, [
    ...valid.map((i) => i.id).filter((id): id is number => typeof id === "number"),
    ...originalIds,
  ]);

  const payersByLine = distributePayersOverLines(payers, valid.map((i) => i.priceCents));
  const kept = new Set<number>();
  for (let k = 0; k < valid.length; k++) {
    const item = valid[k];
    const { splits } = computeSplits("equal", item.priceCents, item.splitMemberIds, {});
    const itemPayers = payersByLine[k];
    if (item.id) {
      await db.updateExpense(item.id, groupId, item.name.trim(), item.priceCents, itemPayers, splits, "equal", item.category);
      kept.add(item.id);
    } else {
      await db.addExpense(groupId, item.name.trim(), item.priceCents, itemPayers, splits, "equal", receiptId, receiptName.trim() || undefined);
    }
  }

  for (const id of originalIds) {
    if (!kept.has(id)) await db.deleteExpense(id, groupId);
  }

  await db.renameReceipt(receiptId, receiptName.trim(), groupId);
  revalidatePath(`/groups/${groupId}`);
}

export async function getInviteToken(groupId: number) {
  await assertAccess(groupId);
  return db.ensureInviteToken(groupId);
}

// Settlement records
export async function recordSettlement(groupId: number, fromMemberId: number, toMemberId: number, amountCents: number) {
  await assertAccess(groupId);
  await assertMembersInGroup(groupId, [fromMemberId, toMemberId]);
  await db.recordSettlement(groupId, fromMemberId, toMemberId, amountCents);
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteSettlementRecord(id: number, groupId: number) {
  await assertAccess(groupId);
  await db.deleteSettlementRecord(id, groupId);
  revalidatePath(`/groups/${groupId}`);
}

// Shopping list
export async function addShoppingItem(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const name = formData.get("name") as string;
  const quantity = (formData.get("quantity") as string) || null;
  const addedByMemberId = formData.get("addedByMemberId") ? Number(formData.get("addedByMemberId")) : null;

  await assertAccess(groupId);
  if (!name) return { error: "Name is required" };
  if (addedByMemberId !== null) await assertMembersInGroup(groupId, [addedByMemberId]);

  await db.addShoppingItem(groupId, name, quantity, addedByMemberId);
  revalidatePath(`/groups/${groupId}`);
}

export async function toggleShoppingItem(id: number, checked: boolean, groupId: number) {
  await assertAccess(groupId);
  await db.toggleShoppingItem(id, checked, groupId);
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteShoppingItem(id: number, groupId: number) {
  await assertAccess(groupId);
  await db.deleteShoppingItem(id, groupId);
  revalidatePath(`/groups/${groupId}`);
}

export async function clearCheckedShoppingItems(groupId: number) {
  await assertAccess(groupId);
  await db.clearCheckedShoppingItems(groupId);
  revalidatePath(`/groups/${groupId}`);
}
