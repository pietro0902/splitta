# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> Note: this is Next.js 16 with React 19. APIs and conventions differ from older versions — see `AGENTS.md` and read `node_modules/next/dist/docs/` before writing framework code.

## What this is

Splitta is a bill-splitting app (split shared expenses across group members). Next.js App Router app deployed to **Cloudflare Workers** via OpenNext, backed by **Cloudflare D1** (SQLite). No accounts: a browser's identity is an opaque random id in an HTTP-only cookie, and groups are shared/joined via an `invite_token`.

## Commands

```bash
npm run dev              # local dev (Next dev server, uses local SQLite — see below)
npm run lint             # eslint
npm run build            # next build (webpack) — type/build check
npm run preview          # build for CF + run under wrangler locally (real workerd runtime)
npm run preview:stop     # stop a preview whose terminal is gone (Windows; see below)
npm run deploy           # build + deploy to Cloudflare

npm run db:migrate:local   # apply migrations/ to local D1 (wrangler --local)
npm run db:migrate:remote  # apply migrations/ to the remote D1 database
```

```bash
npm run check:parser     # exercise the receipt parser on text fixtures (no browser/OCR needed)
npm run icons            # redraw the app icons from scripts/generate-icons.mjs
```

> `npm run dev` is currently broken: Next 16 defaults to Turbopack and `next.config.ts` carries a webpack config, which is a hard error. Use `npx next dev --webpack` — and note `better-sqlite3` is missing from `package.json` entirely, so any DB access under `next dev` throws. Until both are fixed, verify against `npm run preview` (real workerd + local D1).

**On Windows, `build:cf` used to fail with `EBUSY: resource busy or locked, rmdir '...\.open-next\assets'`** (from OpenNext's `initOutputDir`). `wrangler dev` spawns `workerd.exe` children; kill the npm parent without them — closing the terminal, Task Manager, a Ctrl-C the shell doesn't forward — and they survive holding an open handle on `.open-next\assets`, which the next build begins by deleting. `scripts/stop-preview.mjs` clears them and runs automatically before every `build:cf` (npm's `prebuild:cf` hook), so this should no longer reach you; `npm run preview:stop` is the same thing by hand. It only stops processes started from *this* checkout's `node_modules`, so another project's dev server is left alone, and it exits immediately off Windows — POSIX both forwards the signal to the process group and lets you unlink an open file. Wrangler 4.x has no flag that does this for you.

**Deploying with a pending migration** has no atomic swap, so never use `npm run deploy` for it — it rebuilds first and stretches the window in which the live Worker and the schema disagree. Instead: `npm run build:cf` (slow, no impact), then `npm run db:migrate:remote`, then `npx opennextjs-cloudflare deploy` (seconds, publishes the artefact already built).

There is no test suite. Validate changes with `npm run lint` and `npm run build`. When touching receipt extraction, also run `npm run check:parser` — it exits non-zero on failure — and add the failing receipt's OCR text as a new case when you hit one that scans badly.

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
- **Identity and access without accounts**: `src/lib/session.ts` issues an opaque random client id in an HTTP-only cookie (`splitta-cid`), minted the first time you create a group or redeem an invite — those are server actions, and a cookie cannot be set while a server component renders. The `group_access` table maps client id → group (plus which member you said you were), and it is the whole authorization model: `src/lib/access.ts` exposes `requireAccess` for pages (404s, so an unreachable group is indistinguishable from a missing one) and `assertAccess` for actions. **Every mutating action in `actions.ts` must start with `assertAccess(groupId)`** — a matcher/proxy cannot cover them, because server actions are POSTs to whatever route they were used on. Ids coming from the client (member ids, expense ids) are additionally checked against the group with `assertMembersInGroup` / `assertExpensesInGroup`.
  Consequences to keep in mind: clearing site data loses your groups (recoverable via the invite link) and the cookie does not follow you to another device. Real accounts are the fix, and they drop in by turning `group_access.client_id` into a user id.
- **Balances & settlements** are computed, not stored: `db.getBalances()` sums expenses + splits and applies recorded settlements; `db.getSettlements()` runs a greedy debtor/creditor matching to produce minimal "who pays whom" transfers. Recorded settlements (`settlements` table) are actual logged payments that offset balances.
- **Receipt OCR runs entirely in the browser** — no API, no key, no per-scan cost, and the photo never leaves the device. Two modules, deliberately split:
  - `src/lib/ocr.ts` (client-only) owns the scan, and runs **two engines**.
    - **PaddleOCR (PP-OCRv6 tiny) goes first**, via `ppu-paddle-ocr/web` on onnxruntime-web (WebGPU when available, WASM otherwise). Measured on four real receipts: **38/40 prices and 4/4 totals in ~1 s**, against 36/40 and 10-30 s for three Tesseract passes. It gets the photo *unbinarized* — the neural models want natural grey levels, and thresholding measurably hurts them. Models are ~6 MB, fetched from GitHub on first use (self-hosting them under `public/` would remove that external dependency).
    - `layoutFromBoxes()` rebuilds the text from the detected boxes, placing each segment at its true column. Reading `result.text` instead loses the horizontal spacing, and this parser identifies a price by it sitting at end-of-line — that one detail is the difference between 38/40 and 0/40 on a three-column receipt.
    - **Tesseract runs only when PaddleOCR doesn't reconcile** against the printed total, then both engines' results go through `reconcile()`. They fail differently: on a badly creased receipt the neural detector merges a quantity line into the row below, where Tesseract's passes still read it (Bar Rosati: 1/3 vs 3/3). Combining beats either alone.
    - Tesseract preprocesses on canvas (scale → grayscale → **Sauvola** local adaptive threshold) and runs **up to three passes** (2000px/k=0.2, 2000px/k=0.1, 2600px/k=0.2), stopping early when one reconciles. No single configuration won on all four receipts — one photo went 17/18, 15/18, 18/18 across the three.
    - `reconcile()` (in the parser, pure and tested) picks the winner: if any pass's items sum to a total *any* pass could read, those items are right — noise doesn't add up to the penny by accident — and that total is attached even if the winning pass never read it.
    - Preprocessing is not optional: skipping it drops price recovery to 17/30 on the first three receipts. Sauvola beat global Otsu because a crumpled receipt is lit unevenly and one global threshold blows out half of it.
    - Measured and rejected, so don't retry them blind: `user_defined_dpi=300` (27/34, worse), automatic deskew via projection profile (19/34 — the bad photos are *curved*, not rotated, and straightening them hurts), Sauvola window /25 or /60, `oem 3` (identical), and `eng` alongside `ita` (no change, +5 MB). PSM 4 is essential — PSM 6 halves everything.
  - `src/lib/receipt-parser.ts` is a **pure** module (no DOM, no network, no server imports): it turns that text into `{name, price}` items, folding discount lines into the item above, expanding `2 x 1,20` quantity lines, and dropping totals/IVA/payment bookkeeping. It also reads the printed `TOTALE` and returns it as a checksum — the scanner UI shows whether the extracted items add up, so misreads surface instead of passing silently.
  - Tune extraction by editing the keyword lists and regexes at the top of `receipt-parser.ts`; because it's pure, you can exercise it on a text fixture without a browser.
  - `createExpensesFromReceipt` then writes the reviewed items as one expense-per-item sharing a `receipt_id`, after creating the owning `receipts` row.
- **A receipt is one thing, not N rows.** Its lines are separate expenses so each can be split between different people, which means every surface that counts, dates, lists or ranks expenses has to fold them back together first — 167 of 269 expenses in production are receipt lines, so this is the common case, not an edge case. `src/lib/receipts.ts` is the single pure module for it: `groupExpenses`, `countExpenseEntries` (what the tab badge must count — `expenses.length` counts rows and reads ~2× too high), `receiptDate` (the *earliest* line; using the latest re-dates a receipt whenever it's edited) and `receiptPayers` (the union across lines; reading `expenses[0].payers` credits the whole shop to whoever covered the first item).
- **Installability**: `src/app/manifest.ts` plus `appleWebApp` in `layout.tsx` (iOS ignores the manifest's `display`). Icons are committed PNGs generated by `npm run icons` from `scripts/generate-icons.mjs` — pure Node, no image dependency, no build step. The current mark is a **placeholder** in the old terracotta; see `docs/REDESIGN_HANDOFF.md`.

## Data model (D1, see migrations/)

`groups` → `members` (per group) → `expenses` (each with `expense_payers`, who put money in) → `expense_splits` (who owes a share). Plus `settlements` (logged payments between members), `shopping_items` (per-group shopping list), and `group_access` (which client ids may see the group). All child rows cascade-delete with their group.

`receipts` (migration 0015) owns what belongs to a scan as a whole: its name, its category, and `declared_total_cents` — the total printed on the paper, as the parser read it, so "did this scan reconcile?" stays answerable afterwards. `expenses.receipt_name` is gone; `getExpenses` LEFT JOINs the name back on, so callers still read `receipt_name` on an expense but there is exactly one place it can be written.

**All money is integer cents** (`amount_cents`, migration 0012) — never floats, never a `REAL` column. `src/lib/money.ts` is the only boundary between cents and euros: `formatMoney` / `formatAmount` to display, `parseMoney` to read what a user typed, `toCents` for numeric euros (e.g. an OCR'd price). `receipt-parser.ts` is the one deliberate exception: it parses printed euro strings, and `receipt-scanner.tsx` converts at the hand-off. Splits are computed by `computeSplits` in `splits.ts`, which distributes by largest remainder so the parts always sum to the total exactly — so "does this add up?" is `===`, not an epsilon comparison. Do not reintroduce tolerances.

## Secrets / env

The D1 binding `DB` is the only entry in `CloudflareEnv` (`src/env.d.ts`); in production it comes from the Worker environment. The app needs no API keys — receipt OCR runs client-side. Never commit real secrets.

## In flight

A full redesign is agreed and not started — **zero lines written**. The chosen
direction, its tokens, the screen-by-screen specification and the two decisions
that block implementation are in [`docs/REDESIGN_HANDOFF.md`](docs/REDESIGN_HANDOFF.md).
Read it before touching anything visual.

## UI stack

Tailwind v4, shadcn-style components under `src/components/ui/`, `base-ui` primitives, `lucide-react` icons, `framer-motion`, `recharts` (analytics), `next-themes` (dark mode). The `@/*` alias maps to `src/*`.
