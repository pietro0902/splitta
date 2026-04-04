"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

export async function addExpense(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const description = formData.get("description") as string;
  const amount = Number(formData.get("amount"));
  const paidByMemberId = Number(formData.get("paidByMemberId"));
  const splitMemberIds = (formData.get("splitMemberIds") as string)
    .split(",")
    .map(Number)
    .filter(Boolean);

  if (!description || !amount || !paidByMemberId || splitMemberIds.length === 0) {
    return { error: "All fields are required" };
  }

  await db.addExpense(groupId, description, amount, paidByMemberId, splitMemberIds);
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
      model: "claude-sonnet-4-6-20250527",
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
  paidByMemberId: number,
  items: { name: string; price: number; splitMemberIds: number[] }[],
  receiptName?: string
) {
  const receiptId = crypto.randomUUID();
  const name = receiptName?.trim() || undefined;
  for (const item of items) {
    if (item.splitMemberIds.length > 0 && item.price > 0) {
      await db.addExpense(groupId, item.name, item.price, paidByMemberId, item.splitMemberIds, receiptId, name);
    }
  }
  revalidatePath(`/groups/${groupId}`);
}

export async function renameReceipt(receiptId: string, name: string, groupId: number) {
  await db.renameReceipt(receiptId, name.trim());
  revalidatePath(`/groups/${groupId}`);
}

export async function getInviteToken(groupId: number) {
  return db.ensureInviteToken(groupId);
}
