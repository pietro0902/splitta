import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { InviteClient } from "./invite-client";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const group = await db.getGroupByToken(token);
  if (!group) notFound();

  return <InviteClient group={group} />;
}
