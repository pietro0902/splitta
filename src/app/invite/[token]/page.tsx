import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getClientId } from "@/lib/session";
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

  // Whether you are already in this group is now something the server knows,
  // so the page renders the right state instead of flashing "join" until
  // localStorage has been read on the client.
  const clientId = await getClientId();
  const alreadyJoined = clientId ? await db.hasAccess(group.id, clientId) : false;

  return <InviteClient group={group} token={token} alreadyJoined={alreadyJoined} />;
}
