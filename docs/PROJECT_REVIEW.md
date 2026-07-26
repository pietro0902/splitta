# Splitta — Project Review & Roadmap

_Reviewed at commit `ae7d499` (2026-04-04). Scope: the whole repo — 3.4k lines of TypeScript across 22 components, 4 routes, one D1 access module, 7 migrations._

---

## 1. Where the project stands

Splitta is a group expense splitter deployed to Cloudflare Workers via OpenNext, backed by D1. The feature surface is genuinely good for its size:

| Area | State |
|---|---|
| Groups, members, expenses, splits | Complete |
| Balance calculation + greedy settlement suggestion | Complete (`db.ts:219`, `db.ts:314`) |
| Settlement history (recorded payments feed back into balances) | Complete |
| Receipt OCR via Claude vision → per-item expenses | Complete (`actions.ts:94`) |
| Expense categories, analytics tab, charts | Complete |
| Shopping list | Complete |
| Magic-link invites | Partial — link works, but see §2 |
| Identity / auth / access control | **Absent** |
| Tests, CI | **Absent** |

The UI layer is the strongest part of the codebase: consistent design tokens, dark mode, mobile-aware tab bar, framer-motion transitions, sensible component decomposition. The data layer is where the debt sits.

**The single most important fact about this codebase:** it has no concept of a user. "Which groups are mine" is a `number[]` in `localStorage` (`src/lib/local-groups.ts`). Everything below follows from that.

---

## 2. Findings, ranked

### S1 — Every group in the database is rendered into every visitor's homepage

`src/app/page.tsx:9` calls `db.getGroups()`. That function (`src/lib/db.ts:14`) does `SELECT * FROM groups` with no filter, then enriches **each** group with its full member list and spend total. The result is passed to `<GroupList>`, and the narrowing to "my groups" happens client-side at `src/components/group-list.tsx:22`:

```ts
const myGroups = groups.filter((g) => myIds.includes(g.id));
```

The filter is cosmetic. The server-rendered HTML shipped to every anonymous visitor contains every group name, every member name, and every group's total spend across the entire application. View-source is enough to read it.

This is the highest-priority item in the repo and it is not a large fix: the homepage needs to take the caller's group IDs and query for those only.

### S2 — No server action checks whether the caller may touch the record

Every mutation in `src/lib/actions.ts` accepts a primary key from the client and acts on it unconditionally:

- `deleteGroup(groupId)` — `actions.ts:25`
- `deleteExpense(expenseId, groupId)` — `actions.ts:65`
- `updateExpense(...)` — `actions.ts:49`
- `addMember(formData)` — `actions.ts:70`
- `recordSettlement` / `deleteSettlementRecord` — `actions.ts:162`, `actions.ts:167`
- all four shopping-list mutations — `actions.ts:173`–`198`

Group IDs are `INTEGER PRIMARY KEY AUTOINCREMENT` (`migrations/0001_init.sql`), so they are 1, 2, 3, …. Server actions are addressable HTTP endpoints. Anyone who can reach the deployment can delete every group in it with a loop.

`renameReceipt` (`actions.ts:152`) and `deleteSettlementRecord` additionally aren't scoped to a group at all — they act on a bare ID.

### S3 — Visiting a group page silently claims it

`/groups/[id]` renders on the sequential integer ID; the invite token is never required to read a group. Worse, `<AutoClaimGroup>` (`src/components/auto-claim-group.tsx:8`) writes the group into the visitor's `localStorage` on mount. Walking `/groups/1`, `/groups/2`, … both reads every group and adds them all to the walker's own group list.

This was added deliberately (commit `8652957`, "auto-claim group when visiting its page directly") to make shared links work, but it makes the invite token decorative. Reads should require the token, or a membership record established by redeeming one.

### S4 — The OCR action is an open, unmetered proxy to a paid API

`scanReceiptClaude` (`actions.ts:94`) is callable by anyone, has no rate limit, and performs no validation of the uploaded file before `Buffer.from(bytes).toString("base64")` and a Sonnet vision call. Two consequences: unbounded spend against `ANTHROPIC_API_KEY`, and a memory-exhaustion path in the Worker for a large upload. It needs a size cap, a MIME allowlist, and per-caller throttling (a D1 or KV counter is enough).

### H1 — Money is stored as floating point

`amount REAL` in `migrations/0001_init.sql`, for both `expenses` and `expense_splits`, and again in `settlements` (`0006`). `getBalances` (`db.ts:314`) accumulates those floats and rounds only at the very end. Standard advice applies: store integer cents, format at the edge. Doing this later means a data migration, so it is cheaper now than at any future point.

### H2 — Split remainders vanish

`db.ts:140` (and identically `db.ts:178`):

```ts
const splitAmount = amount / splitMemberIds.length;
```

Each member's split is stored as that same value. €10.00 split three ways stores 3.3333… three times; the splits sum to €9.9999…, and after the display rounding at `db.ts:337` the balances quietly fail to close. The fix is to compute in cents and hand the remainder cents to the first _n_ members.

Related: the codebase has no notion of an uneven split (shares, percentages, exact amounts) even though the schema — a per-member `amount` row in `expense_splits` — already supports it perfectly. That's a feature sitting one form away.

### H3 — The group page loads the expense list three times

`src/app/groups/[id]/page.tsx:22` looks efficient — a `Promise.all` over four calls — but the call graph overlaps:

- `db.getGroup(id)` → `getExpenses`
- `db.getBalances(id)` → `getExpenses` **and** `getSettlementRecords`
- `db.getSettlements(id)` → `getBalances` → `getExpenses` **and** `getSettlementRecords` again
- `db.getSettlementRecords(id)` → a third time

Each `getExpenses` is two D1 round trips (`db.ts:86`). So one page render issues roughly 3× the expense queries and 3× the settlement-record queries it needs. The correct shape is to fetch the group's raw data once and derive balances and settlements as pure functions over it — which is what they already are, apart from the fetching.

### H4 — `getGroups` is N+1, next to a comment about avoiding N+1

`db.ts:20-26` issues two extra queries per group. Twelve lines lower, `getExpenses` carries the comment `// Single query with JOIN to avoid N+1` and does the right thing. Fixing S1 (query only the caller's groups) reduces the blast radius but doesn't remove the pattern; a `GROUP BY` aggregate handles both.

### M1 — No indexes on any foreign key

Only `idx_groups_invite_token` exists. `expense_splits.expense_id`, `expenses.group_id`, `settlements.group_id`, and `shopping_items.group_id` are all unindexed, so the `WHERE es.expense_id IN (…)` at `db.ts:110` is a full table scan that grows with total application data, not with group size. One migration fixes all of it.

### M2 — Deleting a member destroys their expense history

`expenses.paid_by_member_id` is `ON DELETE CASCADE` (`0001_init.sql`). There is no member-removal feature today, so nothing triggers it — but adding one, which is an obvious next feature, would silently delete every expense that person ever paid for and corrupt everyone else's balances. Members need soft deletion (or `ON DELETE RESTRICT`) *before* that feature lands.

### M3 — Smaller items

- `README.md` is still unmodified `create-next-app` boilerplate — no description, no setup, no D1/migration instructions, no mention of `ANTHROPIC_API_KEY`.
- No tests and no CI workflow. `.github/` does not exist. Nothing currently prevents a broken `main`.
- Currency is a hardcoded `&euro;` in six components. One `formatMoney` helper would centralise it and pair naturally with the integer-cents migration (H1).
- `.split(",").map(Number).filter(Boolean)` (`actions.ts:35`) silently discards `NaN` from malformed input rather than rejecting it — a bad payload produces a partial split instead of an error.
- `createGroup` (`actions.ts:8`) never calls `revalidatePath("/")`, unlike every sibling action.
- `migrations/0004_invite_token.sql` uses bare `CREATE UNIQUE INDEX`, not `IF NOT EXISTS` — it will fail on re-application where every other migration is idempotent.
- Every route is `export const dynamic = "force-dynamic"`, so nothing caches. Fine for now; worth revisiting once reads are scoped to a user.
- No `error.tsx` / `loading.tsx` boundaries anywhere; a D1 hiccup surfaces as the raw framework error page.
- No web app manifest or icons despite an explicitly mobile-first UI — the app can't be installed to a home screen.

---

## 3. Roadmap

Ordering is driven by one constraint: **S1–S3 make the app unsafe to share with anyone outside a circle of trust, and H1–H2 get more expensive to fix with every row written.** Both classes come before new features.

### Phase 0 — Make sharing safe (blocking)

Nothing else should ship before this. Target: a group is readable and mutable only by someone who redeemed its invite.

1. Give the browser a durable identity — a signed, HTTP-only cookie holding a client ID, issued on first visit. No accounts, no passwords; this preserves the current frictionless UX.
2. Add a `group_access (group_id, client_id, member_id, created_at)` table. Redeeming an invite token inserts a row; creating a group inserts one for the creator. This is the missing piece that `localStorage` is standing in for.
3. Scope every read to it: `getGroups` joins `group_access`; `getGroup` and the group page verify a row exists, else `notFound()`.
4. Add an assertion helper (`assertMember(groupId)`) and call it at the top of every mutating action in `actions.ts`. For actions that take a bare ID (`deleteExpense`, `renameReceipt`, `deleteSettlementRecord`) resolve the owning group first.
5. Drop `<AutoClaimGroup>`; claiming happens only through `/invite/[token]`.
6. Rate-limit and validate `scanReceiptClaude` — MIME allowlist, ~5 MB cap, per-client-ID quota.

`localStorage` can stay as a client-side hint, but it must stop being the security boundary.

### Phase 1 — Money correctness

7. Migrate `amount` columns to integer cents (`amount_cents INTEGER`), with a backfill migration. Add a `formatMoney` / `parseMoney` pair and route all display through it.
8. Fix remainder distribution in `addExpense` and `updateExpense` so splits always sum exactly to the total.
9. Add the currency as a per-group column while the money migration is already open — cheaper than a second pass.

### Phase 2 — Performance and schema

10. Restructure the group page to fetch once and derive: one `getGroupData(id)` returning members + expenses + settlement records, with `computeBalances` and `computeSettlements` as pure functions over that. Removes ~6 redundant D1 round trips per render.
11. Collapse `getGroups` into a single aggregate query.
12. Add the missing foreign-key indexes (M1).
13. Change member deletion semantics to soft-delete before any member-removal UI is built (M2).

### Phase 3 — Engineering hygiene

14. Unit tests for the logic that actually has invariants: `computeBalances`, `computeSettlements` (does it converge? does it minimise transfers?), split-remainder distribution, and OCR response parsing. These are pure functions once Phase 2 lands — cheap to test, and they're where a bug costs users real money.
15. A GitHub Actions workflow running `tsc --noEmit`, `eslint`, and the test suite on PRs.
16. Rewrite `README.md`: what Splitta is, local setup, `wrangler d1 migrations apply`, required secrets, deploy steps.
17. Add `error.tsx` and `loading.tsx` boundaries.

### Phase 4 — Product

Ordered by value-per-unit-of-work, given the schema already in place:

18. **Uneven splits** (exact amounts / shares / percentages) — the schema supports it today; this is the most-requested feature of any splitting app and the largest gap in the current feature set.
19. **Member management** — rename, remove (soft), re-colour. Depends on item 13.
20. **PWA manifest + icons** — small, and the mobile-first UI is otherwise not installable.
21. **Recurring expenses** — rent and utilities are already categories; they're monthly by nature.
22. **Export** (CSV / JSON) — cheap to build, and it's the honest answer to "can I trust this with my data".
23. **Multi-currency conversion** — only meaningful after item 9.

---

## 4. Suggested next step

Phase 0, items 1–5, as a single change. It touches `db.ts`, `actions.ts`, both page components and one new migration, but it is mechanical, and it converts Splitta from "a shared spreadsheet anyone can read and delete" into something that can be linked to a friend without caveats. Everything in Phases 1–4 is a normal product backlog; Phase 0 is not.

---

### Notes on this review

- `node_modules` was not installed in the review environment, so `tsc`, `eslint`, and the build were not executed. Every finding above comes from reading source, schema, and configuration; none depends on a build result. The performance claims in H3/H4 are read off the call graph and are worth confirming against real query logs before optimising.
- Findings are labelled S (sharing/access), H (high), M (medium). No claim here is speculative about intent — where a behaviour looks deliberate (S3), that's noted.
