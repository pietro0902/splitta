"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

  const groupId = db.createGroup(name, emoji, memberNames);
  redirect(`/groups/${groupId}`);
}

export async function deleteGroup(groupId: number) {
  db.deleteGroup(groupId);
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

  db.addExpense(groupId, description, amount, paidByMemberId, splitMemberIds);
  revalidatePath(`/groups/${groupId}`);
}

export async function deleteExpense(expenseId: number, groupId: number) {
  db.deleteExpense(expenseId);
  revalidatePath(`/groups/${groupId}`);
}

export async function addMember(formData: FormData) {
  const groupId = Number(formData.get("groupId"));
  const name = formData.get("name") as string;
  const color = (formData.get("color") as string) || "#C4572A";

  if (!name) return { error: "Name is required" };

  db.addMember(groupId, name, color);
  revalidatePath(`/groups/${groupId}`);
}
