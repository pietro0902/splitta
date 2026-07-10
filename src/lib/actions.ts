"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { computeSplits, splitsAreValid, SPLIT_MODES, type SplitInput, type SplitMode } from "@/lib/splits";
import { payersAreValid, distributePayersOverLines, type PayerInput } from "@/lib/payers";

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

  const groupId = await db.createGroup(name, emoji, memberNames);
  return { groupId };
}

export async function deleteGroup(groupId: number) {
  await db.deleteGroup(groupId);
  revalidatePath("/");
}

function parseSplits(raw: FormDataEntryValue | null): SplitInput[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({
        memberId: Number(s.memberId),
        amount: Number(s.amount),
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
      .map((p) => ({ memberId: Number(p.memberId), amount: Number(p.amount) }))
      .filter((p) => p.memberId && Number.isFinite(p.amount) && p.amount > 0);
  } catch {
    return [];
  }
}

export async function addExpense(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const description = formData.get("description") as string;
  const amount = Number(formData.get("amount"));
  const payers = parsePayers(formData.get("payers"));
  const splitMode = parseSplitMode(formData.get("splitMode"));
  const splits = parseSplits(formData.get("splits"));
  const category = (formData.get("category") as string) || undefined;

  if (!description || !amount || payers.length === 0 || splits.length === 0) {
    return { error: "All fields are required" };
  }
  if (!payersAreValid(amount, payers)) {
    return { error: "The paid amounts do not add up to the total" };
  }
  if (!splitsAreValid(amount, splits)) {
    return { error: "The split does not add up to the total" };
  }

  await db.addExpense(groupId, description, amount, payers, splits, splitMode, undefined, undefined, category);
  revalidatePath(`/groups/${groupId}`);
}

export async function updateExpense(
  expenseId: number,
  groupId: number,
  description: string,
  amount: number,
  payers: PayerInput[],
  splits: SplitInput[],
  splitMode: SplitMode,
  category?: string
) {
  if (!description || !amount || payers.length === 0 || splits.length === 0) {
    return { error: "All fields are required" };
  }
  if (!payersAreValid(amount, payers)) {
    return { error: "The paid amounts do not add up to the total" };
  }
  if (!splitsAreValid(amount, splits)) {
    return { error: "The split does not add up to the total" };
  }
  await db.updateExpense(expenseId, description, amount, payers, splits, splitMode, category);
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteExpense(expenseId: number, groupId: number) {
  await db.deleteExpense(expenseId);
  revalidatePath(`/groups/${groupId}`);
}

export async function addMember(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const name = formData.get("name") as string;
  const color = (formData.get("color") as string) || "#C4572A";

  if (!name) return { error: "Name is required" };

  await db.addMember(groupId, name, color);
  revalidatePath(`/groups/${groupId}`);
}

export type ReceiptItem = {
  name: string;
  price: number;
};

const OCR_PROMPT = `Extract all items and their final prices from this receipt.
Rules:
- If a discount line follows a product (e.g. "Sconto 40%", "Sconto Carta", or a negative price), apply the discount to that product and return the net price (product price minus discount).
- Do NOT include discount lines as separate items.
- Do NOT include totals, subtotals, tax (IVA), or payment lines.
- Skip items you cannot read clearly.
Return ONLY a JSON array, no other text. Format: [{"name": "item name", "price": 1.23}].`;

export async function scanReceiptClaude(formData: FormData) {
  const file = formData.get("image") as File;
  if (!file) return { error: "No image provided", items: [] as ReceiptItem[] };

  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>({ async: true });
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY not configured", items: [] as ReceiptItem[] };

  try {
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: OCR_PROMPT },
          ],
        },
      ],
    });

    const text = response.content.find((c) => c.type === "text")?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { error: "Could not parse receipt", items: [] as ReceiptItem[] };

    const items: ReceiptItem[] = JSON.parse(jsonMatch[0]);
    return { items };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Claude OCR error:", msg, e);
    return { error: `Scan failed: ${msg}`, items: [] as ReceiptItem[] };
  }
}


export async function createExpensesFromReceipt(
  groupId: number,
  payers: PayerInput[],
  items: { name: string; price: number; splitMemberIds: number[] }[],
  receiptName?: string
) {
  const receiptId = crypto.randomUUID();
  const name = receiptName?.trim() || undefined;
  const valid = items.filter((i) => i.splitMemberIds.length > 0 && i.price > 0);
  const payersByLine = distributePayersOverLines(payers, valid.map((i) => i.price));
  for (let k = 0; k < valid.length; k++) {
    const item = valid[k];
    const { splits } = computeSplits("equal", item.price, item.splitMemberIds, {});
    await db.addExpense(groupId, item.name, item.price, payersByLine[k], splits, "equal", receiptId, name);
  }
  revalidatePath(`/groups/${groupId}`);
}

export async function renameReceipt(receiptId: string, name: string, groupId: number) {
  await db.renameReceipt(receiptId, name.trim());
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
  items: { id?: number; name: string; price: number; splitMemberIds: number[]; category?: string }[],
  originalIds: number[]
) {
  if (payers.length === 0) return { error: "Select who paid" };

  const valid = items.filter((i) => i.name.trim() && i.price > 0 && i.splitMemberIds.length > 0);
  if (valid.length === 0) return { error: "Add at least one item" };

  const payersByLine = distributePayersOverLines(payers, valid.map((i) => i.price));
  const kept = new Set<number>();
  for (let k = 0; k < valid.length; k++) {
    const item = valid[k];
    const { splits } = computeSplits("equal", item.price, item.splitMemberIds, {});
    const itemPayers = payersByLine[k];
    if (item.id) {
      await db.updateExpense(item.id, item.name.trim(), item.price, itemPayers, splits, "equal", item.category);
      kept.add(item.id);
    } else {
      await db.addExpense(groupId, item.name.trim(), item.price, itemPayers, splits, "equal", receiptId, receiptName.trim() || undefined);
    }
  }

  for (const id of originalIds) {
    if (!kept.has(id)) await db.deleteExpense(id);
  }

  await db.renameReceipt(receiptId, receiptName.trim());
  revalidatePath(`/groups/${groupId}`);
}

export async function getInviteToken(groupId: number) {
  return db.ensureInviteToken(groupId);
}

// Settlement records
export async function recordSettlement(groupId: number, fromMemberId: number, toMemberId: number, amount: number) {
  await db.recordSettlement(groupId, fromMemberId, toMemberId, amount);
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteSettlementRecord(id: number, groupId: number) {
  await db.deleteSettlementRecord(id);
  revalidatePath(`/groups/${groupId}`);
}

// Shopping list
export async function addShoppingItem(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const name = formData.get("name") as string;
  const quantity = (formData.get("quantity") as string) || null;
  const addedByMemberId = formData.get("addedByMemberId") ? Number(formData.get("addedByMemberId")) : null;

  if (!name) return { error: "Name is required" };

  await db.addShoppingItem(groupId, name, quantity, addedByMemberId);
  revalidatePath(`/groups/${groupId}`);
}

export async function toggleShoppingItem(id: number, checked: boolean, groupId: number) {
  await db.toggleShoppingItem(id, checked);
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteShoppingItem(id: number, groupId: number) {
  await db.deleteShoppingItem(id);
  revalidatePath(`/groups/${groupId}`);
}

export async function clearCheckedShoppingItems(groupId: number) {
  await db.clearCheckedShoppingItems(groupId);
  revalidatePath(`/groups/${groupId}`);
}
