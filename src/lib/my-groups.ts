import { cache } from "react";
import { db } from "./db";
import { getClientId } from "./session";

// The caller's groups, with their balances. Wrapped in React's `cache` because
// two things in the same render need it: the (app) layout, for the sidebar rail,
// and the homepage, for the list and the headline figure. Without this the two
// would be four database round trips per page load instead of two.
//
// The cache is per-request, so it never serves one browser's groups to another.
export const getMyGroups = cache(async () => {
  const clientId = await getClientId();
  return clientId ? await db.getGroups(clientId) : [];
});
