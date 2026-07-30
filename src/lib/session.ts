// The browser's identity. Server-only: imported by pages and server actions.
//
// Splitta has no accounts, so "who is asking" is a random opaque id stored in an
// HTTP-only cookie. It is not signed on purpose: the value *is* the credential,
// like a session token, and it is 122 bits of randomness -- signing would prove
// we issued it, which buys nothing when the only thing an attacker could forge
// is a value they would still have to guess. It also keeps the app free of any
// secret to provision, which is why `CloudflareEnv` still holds only `DB`.
//
// The cookie is the whole security boundary today, with the limits that implies:
// clearing site data loses your groups (recoverable through the invite link),
// and it does not follow you to another device. Real accounts are the fix for
// both, and this table-backed model is what makes them a drop-in later --
// `group_access.client_id` becomes a user id and nothing else moves.
import { cookies } from "next/headers";

const COOKIE = "splitta-cid";
// 400 days is the ceiling Chrome enforces on cookie lifetime; asking for more
// is silently clamped, so ask for exactly that.
const MAX_AGE = 60 * 60 * 24 * 400;

export async function getClientId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

// Issue the cookie if the browser doesn't have one yet.
//
// Only callable from a server action or route handler: cookies cannot be set
// while a server component renders. That is not a limitation here -- a visitor
// with no cookie has no groups by definition, so the id is only ever needed at
// the moment they create a group or redeem an invite, and both are actions.
export async function getOrCreateClientId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;

  const clientId = crypto.randomUUID();
  jar.set(COOKIE, clientId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return clientId;
}
