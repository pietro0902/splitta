# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> Note: this is Next.js 16 with React 19. APIs and conventions differ from older versions — see `AGENTS.md` and read `node_modules/next/dist/docs/` before writing framework code.

## What this is

Splitta is a bill-splitting app (split shared expenses across group members). Next.js App Router app deployed to **Cloudflare Workers** via OpenNext, backed by **Cloudflare D1** (SQLite). No auth: group membership is tracked client-side in `localStorage`, and groups are shared/joined via an `invite_token`.

## Commands

```bash
npm run dev              # local dev (Next dev server, uses local SQLite — see below)
npm run lint             # eslint
npm run build            # next build (webpack) — type/build check
npm run preview          # build for CF + run under wrangler locally (real workerd runtime)
npm run deploy           # build + deploy to Cloudflare

npm run db:migrate:local   # apply migrations/ to local D1 (wrangler --local)
npm run db:migrate:remote  # apply migrations/ to the remote D1 database
```

```bash
npx tsx parser-check.mts   # exercise the receipt parser on text fixtures (no browser/OCR needed)
```

There is no test suite. Validate changes with `npm run lint` and `npm run build`. When touching receipt extraction, also run `parser-check.mts` — and add the failing receipt's OCR text as a new case when you hit one that scans badly.

## Database access — the dev/prod split (important)

All DB access goes through the single `db` object in `src/lib/db.ts`. That module picks the backend at runtime inside `getDb()`:

- **production / `wrangler dev` / preview**: uses the real D1 binding `env.DB` via `getCloudflareContext()`.
- **`next dev` (`NODE_ENV=development`)**: uses `src/lib/local-d1.ts`, a hand-rolled `better-sqlite3` shim that mimics the D1 API (`prepare/bind/all/first/run/batch`). It writes to `.wrangler/state/local.sqlite` and **auto-applies everything in `migrations/` on first connect** (tracked in a `_migrations` table). So plain `next dev` does NOT need `db:migrate:local`.

Consequence: keep `src/lib/local-d1.ts` API-compatible with D1, and write SQL that runs on both. `better-sqlite3` is loaded via a `const mod = "better-sqlite3"; require(mod)` indirection specifically to stop the bundler from tracing it into the Worker build — don't "clean that up" into a static import.

`db-types.ts` holds the row/domain types and `EXPENSE_CATEGORIES`. It is the client-safe types module (no server imports), so it can be imported from client components; `db.ts` re-exports the types from it. Import types from `@/lib/db-types` in client code, never from `@/lib/db`.

## Migrations

Plain numbered SQL files in `migrations/` (`NNNN_name.sql`), applied in filename sort order. Add the next number; never edit an applied migration. Both the local shim and `wrangler d1 migrations apply` consume this directory. After adding one, run `db:migrate:remote` to apply it to production D1 (the local shim picks it up automatically on next `next dev`).

## Architecture

- **Mutations = Next.js Server Actions** in `src/lib/actions.ts` (`"use server"`). Components call these directly; each action calls `db.*` then `revalidatePath()` to refresh server-rendered data. There are no route handlers / API routes for app data.
- **Pages are Server Components** that read via `db.*` directly and are marked `export const dynamic = "force-dynamic"` (no caching — data is always fresh).
- **Routes**: `/` (group list), `/groups/[id]` (group detail with tabs: expenses, balances, settlements, shopping, analytics), `/invite/[token]` (join-by-link flow).
- **Membership without auth**: which groups "you" belong to lives in `localStorage` via `src/lib/local-groups.ts` (`splitta-groups` key). Opening an invite link claims the group into your local list (`auto-claim-group` / `invite-client`). The server has no concept of users.
- **Balances & settlements** are computed, not stored: `db.getBalances()` sums expenses + splits and applies recorded settlements; `db.getSettlements()` runs a greedy debtor/creditor matching to produce minimal "who pays whom" transfers. Recorded settlements (`settlements` table) are actual logged payments that offset balances.
- **Receipt OCR runs entirely in the browser** — no API, no key, no per-scan cost, and the photo never leaves the device. Two modules, deliberately split:
  - `src/lib/ocr.ts` (client-only) preprocesses the photo on a canvas (upscale → grayscale → Otsu binarization) and runs Tesseract.js WASM against it, returning raw text. Tesseract assets (~5 MB) load on demand from the CDN on first scan and are then cached in IndexedDB.
  - `src/lib/receipt-parser.ts` is a **pure** module (no DOM, no network, no server imports): it turns that text into `{name, price}` items, folding discount lines into the item above, expanding `2 x 1,20` quantity lines, and dropping totals/IVA/payment bookkeeping. It also reads the printed `TOTALE` and returns it as a checksum — the scanner UI shows whether the extracted items add up, so misreads surface instead of passing silently.
  - Tune extraction by editing the keyword lists and regexes at the top of `receipt-parser.ts`; because it's pure, you can exercise it on a text fixture without a browser.
  - `createExpensesFromReceipt` then writes the reviewed items as one expense-per-item sharing a `receipt_id`.

## Data model (D1, see migrations/)

`groups` → `members` (per group) → `expenses` (each `paid_by` a member) → `expense_splits` (who owes a share of an expense). Plus `settlements` (logged payments between members), `shopping_items` (per-group shopping list). All child rows cascade-delete with their group. Expenses split evenly: `splitAmount = amount / splitMemberIds.length`.

## Secrets / env

The D1 binding `DB` is the only entry in `CloudflareEnv` (`src/env.d.ts`); in production it comes from the Worker environment. The app needs no API keys — receipt OCR runs client-side. Never commit real secrets.

## UI stack

Tailwind v4, shadcn-style components under `src/components/ui/`, `base-ui` primitives, `lucide-react` icons, `framer-motion`, `recharts` (analytics), `next-themes` (dark mode). The `@/*` alias maps to `src/*`.
