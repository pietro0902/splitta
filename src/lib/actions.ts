"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  redirect(`/groups/${groupId}`);
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

const OCR_PROMPT = `Extract all items and their prices from this receipt. Return ONLY a JSON array, no other text. Format: [{"name": "item name", "price": 1.23}]. Use the exact prices shown. If you cannot read an item clearly, skip it.`;

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
      model: "claude-sonnet-4-20250514",
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
  } catch (e) {
    console.error("Claude OCR error:", e);
    return { error: "Failed to scan receipt. Please try again.", items: [] as ReceiptItem[] };
  }
}

export async function scanReceiptWorkersAI(formData: FormData) {
  const file = formData.get("image") as File;
  if (!file) return { error: "No image provided", items: [] as ReceiptItem[] };

  try {
    const { env } = await getCloudflareContext<{ env: CloudflareEnv }>({ async: true });
    const bytes = new Uint8Array(await file.arrayBuffer());

    const response = (await env.AI.run(
      "@cf/meta/llama-3.2-11b-vision-instruct" as keyof AiModels,
      {
        messages: [
          {
            role: "user",
            content: OCR_PROMPT,
          },
        ],
        image: [...bytes],
      } as Record<string, unknown>
    )) as { response?: string };

    const text = response?.response ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { error: "Could not parse receipt", items: [] as ReceiptItem[] };

    const items: ReceiptItem[] = JSON.parse(jsonMatch[0]);
    return { items };
  } catch (e) {
    console.error("Workers AI OCR error:", e);
    return { error: "Failed to scan receipt. Please try again.", items: [] as ReceiptItem[] };
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
