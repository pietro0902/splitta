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
npm run check:parser     # exercise the receipt parser on text fixtures (no browser/OCR needed)
```

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
- **Membership without auth**: which groups "you" belong to lives in `localStorage` via `src/lib/local-groups.ts` (`splitta-groups` key). Opening an invite link claims the group into your local list (`auto-claim-group` / `invite-client`). The server has no concept of users.
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
  - `createExpensesFromReceipt` then writes the reviewed items as one expense-per-item sharing a `receipt_id`.

## Data model (D1, see migrations/)

`groups` → `members` (per group) → `expenses` (each `paid_by` a member) → `expense_splits` (who owes a share of an expense). Plus `settlements` (logged payments between members), `shopping_items` (per-group shopping list). All child rows cascade-delete with their group. Expenses split evenly: `splitAmount = amount / splitMemberIds.length`.

## Secrets / env

The D1 binding `DB` is the only entry in `CloudflareEnv` (`src/env.d.ts`); in production it comes from the Worker environment. The app needs no API keys — receipt OCR runs client-side. Never commit real secrets.

## UI stack

Tailwind v4, shadcn-style components under `src/components/ui/`, `base-ui` primitives, `lucide-react` icons, `framer-motion`, `recharts` (analytics), `next-themes` (dark mode). The `@/*` alias maps to `src/*`.
