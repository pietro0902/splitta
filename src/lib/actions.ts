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
    return { error: "Servono un nome e almeno 2 persone" };
  }

  // The one place a brand-new visitor gets an identity, alongside redeeming an
  // invite. Both are actions, which is the only place a cookie can be set.
  // Which of the names just typed in is the person typing. Optional: skipping
  // it costs the personalised figures, not access to the group.
  const rawMe = formData.get("me");
  const parsedMe = rawMe === null || rawMe === "" ? NaN : Number(rawMe);
  const meIndex = Number.isInteger(parsedMe) ? parsedMe : undefined;

  const clientId = await getOrCreateClientId();
  const groupId = await db.createGroup(name, emoji, memberNames, clientId, meIndex);
  revalidatePath("/");
  return { groupId };
}

// Answer "who are you in this group?" after the fact. Covers groups created
// before the question existed, and anyone whose creation-time answer was lost.
export async function claimMemberIdentity(groupId: number, memberId: number) {
  const clientId = await assertAccess(groupId);
  await assertMembersInGroup(groupId, [memberId]);
  await db.setAccessMember(groupId, clientId, memberId);
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
}

export async function deleteGroup(groupId: number) {
  await assertAccess(groupId);
  await db.deleteGroup(groupId);
  revalidatePath("/");
}

// Rename a group, or change its emoji. Both were decided once, at creation, and
// were then unchangeable -- including for the group whose name was a typo.
export async function updateGroup(
  groupId: number,
  name: string,
  emoji: string
): Promise<{ error: string } | undefined> {
  await assertAccess(groupId);

  const trimmed = name.trim();
  if (!trimmed) return { error: "Serve un nome" };

  await db.updateGroup(groupId, trimmed, emoji.trim() || "👥");
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
}

// Remove somebody from a group. Refused outright once they have taken part in
// anything, and that is not caution for its own sake: every foreign key into
// `members` cascades, so the delete would take the expenses they paid for with
// them and shred the splits of the ones they only owed a share of. See
// db.countMemberActivity.
export async function removeMember(
  groupId: number,
  memberId: number
): Promise<{ error: string } | undefined> {
  await assertAccess(groupId);
  await assertMembersInGroup(groupId, [memberId]);

  const activity = await db.countMemberActivity(groupId, memberId);
  if (activity > 0) {
    return {
      error: "Ha già spese o pareggi in questo gruppo: toglierlo cancellerebbe anche quelli.",
    };
  }

  const members = await db.getMembers(groupId);
  if (members.length <= 2) {
    return { error: "Un gruppo ha bisogno di almeno due persone" };
  }

  await db.removeMember(groupId, memberId);
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
}

// Leave a group: drops this browser's access row and nothing else, so the group
// carries on for everyone else. Rejoining means using the invite link again.
export async function leaveGroup(groupId: number) {
  const clientId = await assertAccess(groupId);
  await db.revokeAccess(groupId, clientId);
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
  if (!group) return { error: "Questo link di invito non è più valido" };
  if (memberId !== null && !group.members.some((m) => m.id === memberId)) {
    return { error: "Quella persona non fa parte di questo gruppo" };
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

// The date an expense is filed under, as the client sends it. Only the stored
// shape is accepted -- anything else falls back to "now" rather than being
// written through, because a malformed timestamp in this column would sort
// wrongly forever and there is no legitimate client that can produce one.
function parseSpentAt(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw === "") return undefined;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw : undefined;
}

export async function addExpense(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const description = formData.get("description") as string;
  const amountCents = parseMoney(formData.get("amount") as string);
  const payers = parsePayers(formData.get("payers"));
  const splitMode = parseSplitMode(formData.get("splitMode"));
  const splits = parseSplits(formData.get("splits"));
  const category = (formData.get("category") as string) || undefined;
  const spentAt = parseSpentAt(formData.get("spentAt"));

  await assertAccess(groupId);

  if (!description || !amountCents || payers.length === 0 || splits.length === 0) {
    return { error: "Servono tutti i campi" };
  }
  if (!payersAreValid(amountCents, payers)) {
    return { error: "Gli importi pagati non tornano con il totale" };
  }
  if (!splitsAreValid(amountCents, splits)) {
    return { error: "La divisione non torna con il totale" };
  }
  await assertMembersInGroup(groupId, referencedMemberIds(payers, splits));

  await db.addExpense(
    groupId,
    description,
    amountCents,
    payers,
    splits,
    splitMode,
    undefined,
    category,
    spentAt
  );
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
  category?: string,
  spentAt?: string
) {
  await assertAccess(groupId);

  if (!description || !amountCents || payers.length === 0 || splits.length === 0) {
    return { error: "Servono tutti i campi" };
  }
  if (!payersAreValid(amountCents, payers)) {
    return { error: "Gli importi pagati non tornano con il totale" };
  }
  if (!splitsAreValid(amountCents, splits)) {
    return { error: "La divisione non torna con il totale" };
  }
  await assertExpensesInGroup(groupId, [expenseId]);
  await assertMembersInGroup(groupId, referencedMemberIds(payers, splits));

  await db.updateExpense(
    expenseId,
    groupId,
    description,
    amountCents,
    payers,
    splits,
    splitMode,
    category,
    parseSpentAt(spentAt)
  );
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteExpense(expenseId: number, groupId: number) {
  await assertAccess(groupId);
  await db.deleteExpense(expenseId, groupId);
  revalidatePath(`/groups/${groupId}`);
}

// Add somebody to a group that already exists. Until this had a screen to call
// it, members could only ever be named while creating the group -- so a friend
// who moved into the flat in September could not be given a share of anything.
//
// Explicit union return type, for the reason spelled out on joinGroup above.
export async function addMember(
  groupId: number,
  name: string
): Promise<{ error: string } | undefined> {
  await assertAccess(groupId);

  const trimmed = name.trim();
  if (!trimmed) return { error: "Serve un nome" };

  // Two people called "Marco" makes every row in a split ambiguous to read.
  // Nothing downstream breaks -- members are addressed by id, never by name --
  // but the person choosing who paid has no way to tell them apart.
  const existing = await db.getMembers(groupId);
  if (existing.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
    return { error: "C'è già qualcuno con questo nome" };
  }

  await db.addMember(groupId, trimmed);
  revalidatePath(`/groups/${groupId}`);
  // The homepage row counts members too.
  revalidatePath("/");
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
  category?: string,
  // What the paper said the total was, as the parser read it. Kept so that
  // "did this scan reconcile?" stays answerable after the review screen closes.
  declaredTotalCents?: number,
  // The day on the receipt. Applied to every line, so the shop stays one thing
  // in the list instead of scattering across the day it happened to be scanned.
  spentAt?: string
) {
  await assertAccess(groupId);
  const day = parseSpentAt(spentAt);

  const receiptId = crypto.randomUUID();
  const name = receiptName?.trim() || undefined;
  const valid = items.filter((i) => i.splitMemberIds.length > 0 && i.priceCents > 0);
  await assertMembersInGroup(groupId, [
    ...payers.map((p) => p.memberId),
    ...valid.flatMap((i) => i.splitMemberIds),
  ]);

  // The receipt first, so no line ever references a receipt that isn't there.
  await db.upsertReceipt(receiptId, groupId, name ?? null, category ?? null, declaredTotalCents ?? null);

  const payersByLine = distributePayersOverLines(payers, valid.map((i) => i.priceCents));
  for (let k = 0; k < valid.length; k++) {
    const item = valid[k];
    const { splits } = computeSplits("equal", item.priceCents, item.splitMemberIds, {});
    await db.addExpense(
      groupId,
      item.name,
      item.priceCents,
      payersByLine[k],
      splits,
      "equal",
      receiptId,
      category,
      day
    );
  }
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
  originalIds: number[],
  // One category for the whole shop, applied to each of its lines.
  category?: string,
  // One date for the whole shop, likewise. Omitted keeps the day the receipt
  // already has -- which is also what a line added here inherits, so a forgotten
  // item added to July's shop does not file itself under today.
  spentAt?: string
) {
  await assertAccess(groupId);
  const day = parseSpentAt(spentAt) ?? (await db.getReceiptSpentAt(receiptId, groupId));

  if (payers.length === 0) return { error: "Scegli chi ha pagato" };

  const valid = items.filter((i) => i.name.trim() && i.priceCents > 0 && i.splitMemberIds.length > 0);
  if (valid.length === 0) return { error: "Aggiungi almeno una voce" };

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
      await db.updateExpense(item.id, groupId, item.name.trim(), item.priceCents, itemPayers, splits, "equal", item.category, day);
      kept.add(item.id);
    } else {
      await db.addExpense(groupId, item.name.trim(), item.priceCents, itemPayers, splits, "equal", receiptId, item.category, day);
    }
  }

  for (const id of originalIds) {
    if (!kept.has(id)) await db.deleteExpense(id, groupId);
  }

  // Name and category belong to the receipt, not to its lines. The declared
  // total is left alone: only a scan can establish it, and this is an edit.
  await db.upsertReceipt(receiptId, groupId, receiptName.trim() || null, category ?? null, null);
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
  if (!name) return { error: "Serve un nome" };
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
