# Splitta redesign — handoff

_Written 2026-07-30, at commit `7692eea`, as the specification for a redesign
that had not been started. **Updated 2026-07-30 (later the same day): it has
been. §1 records what was decided and §7 what shipped; §§2–5 remain the
specification the implementation follows.**_

---

## 1. The decisions, answered

**The logo mark: a receipt knocked out of a filled cyan tile.** Chosen over the
folded banknote that was the standing proposal — the receipt is what the app
actually does (the scanner is the reason it exists), and a full-bleed tile
survives being a 22px icon where a line-drawn note turns to mush. Pietro's words
were that he would still prefer something with a banknote in it, so this is
settled but not closed; the idea worth trying next is the same silhouette read
*as* a banknote, keeping the notched hem.

The geometry lives in exactly two places and they must be changed together:
`mark()` in `scripts/generate-icons.mjs` (then `npm run icons`) and
`src/components/brand-mark.tsx`.

Rejected, do not revisit: **any "split S"**. A whole family of them — diagonal
slice, centre gap, split serif, division sign, uneven shares, torn edge — was
shown and dismissed as uninteresting. Also weak: two offset rectangles (a
rectangle is the least recognisable shape there is) and the Venn-diagram pair
(already the logo of many things). A split coin was shown alongside the receipt
and lost, though it was the most distinctive of the four.

**Light and dark, both.** Dark-only was the cheaper option and was not taken:
the app gets used outdoors, at tables, in the sun, and the point of the
redesign is the UX changes in §3, which are wasted on a screen nobody can read
in daylight. The cost is real and worth stating — `#5EE6E6` fails contrast on
white, so in the light theme the brand cyan *changes colour* to `#0C8891`. It
is kept cheap by one rule: **components use semantic tokens only, never a
hand-written colour**. Follow that and the light theme keeps coming for free.

**Instrument Serif is gone.** Everything is Geist, with Geist Mono on every
figure via the `.figure` utility. `--font-display` survives as an alias so
`font-heading` still resolves.

---

## 2. The direction: "Ghiaccio"

Blue-black ground, cyan accent, layered rounded surfaces, generous radii. It
was chosen from six dark variants. The others, for the record: *Notturno*
(warm black, amber, serif numerals), *Terminale* (monospace and hairlines —
the only one that made dense screens actively better), *Duotono* (one saturated
colour as a full field), *Contrasto* (pure black and white, colour only where
it means something), *Ribaltato* (the same structure in light).

The honest weakness of Ghiaccio, stated at the time and still true: cyan on
dark blue is the uniform of half the fintech apps in existence. It is the least
distinctive of the six. The logo therefore has to carry more identity than it
otherwise would.

### Tokens

Values are taken from the approved mockups. They are the dark theme; the light
counterpart is derived from them and lives beside them in
`src/app/globals.css`.

| Role | Value |
|---|---|
| Background | `#0B0E14` |
| Surface (rows, cards) | `#111722` |
| Surface raised (hero card) | `#141A26` |
| Border | `#1E2635` |
| Hairline inside lists | `#151B26` |
| Text primary | `#DCE3EE` |
| Text muted | `#7C8798` |
| Accent (interactive, brand) | `#5EE6E6` |
| Accent field (chip background) | `#0F2429` |
| Accent border | `#1E3A3D` |
| Positive — "you are owed" | `#6FE3B0` |
| Negative — "you owe" | `#FF7A6B` |
| Success strip bg / border / text | `#0F2118` / `#1D3A2A` / `#A8D9C0` |

**Cyan is not "positive".** An earlier pass used the accent for credit balances
and it was deliberately changed: green money got its own mint, so the brand
colour stays free to mean "you can touch this". Keep that separation.

### Member colours survive

The existing earthy member palette is not thrown away — it becomes dark tinted
chips, legible at a glance in a list without ever competing with the accent.
Pattern is `background` / `foreground`:

| | Background | Foreground |
|---|---|---|
| amber | `#2B2119` | `#E0A76B` |
| violet | `#2A2130` | `#C79BE0` |
| blue | `#19262B` | `#6FC3E0` |
| olive | `#242A19` | `#B6D06B` |
| receipt icon | `#1B2A2E` | `#5EE6E6` |

Group emoji were replaced by coloured monograms in the mockups. This is a real
change to confirm with Pietro — it is cleaner, but users chose those emoji by
hand and it costs some personality.

### The one structural rule

**Rounded surfaces for summaries. Bare hairlines for lists.**

This is the rule that makes the direction survive contact with real data. A
group has 82 expenses; if every one is a rounded bordered card, seven rows fill
the screen with chrome and the design collapses — which is exactly why the
bolder "Blocchi" variant was rejected. Cards appear where there is *one*
important number. They disappear where there are many.

---

## 3. The UX changes, which matter more than the colours

These are the reason to do the redesign at all. They are not skin.

**1. Your position comes first, everywhere.** The homepage today lists, per
group, *how much the group spent*. Nobody opens the app to ask that. They ask
"how much do I owe / am I owed". That figure moves to the top of the homepage
as the single largest thing on screen, and to the top of each group. The group
total demotes to a secondary figure inside the group.

**2. Every expense row shows your share.** Scanning a list, `€148,50` is not
the number you want — `tua: €18,56` is. It goes under the amount, in muted
text.

**3. The receipt reconciliation becomes visible.** The parser reads the printed
total and checks the extracted items against it. This is the cleverest thing in
the codebase and it is currently a line of small text. In the redesign it is
the first thing on the review screen: a mint strip with a check when the items
agree, an amber one when they do not. As of migration 0015 the declared total
is stored, so a receipt can also be flagged *later* — in the expense list — if
it never reconciled.

**4. The amount is the hero of the add-expense sheet**, not a field among
fields, with the live per-person split (`€12,15 a testa`) shown next to the
split selector.

---

## 4. Screens as designed

### Homepage

Header: wordmark, plus one control. Then a raised surface holding `Ti devono`
and the total across all groups at ~36px, with small chips beneath
(`3 da saldare`, `4 gruppi`). Then a full-width accent pill `Aggiungi spesa`
with a square outline scan button beside it. Then `I tuoi gruppi` as rounded
rows: monogram, name, member count, and *your* balance in mint or coral.
Settled groups show the word `saldato` in muted text instead of a figure.

### Group detail — expenses

Header with a back chevron, the group name, and a share icon in accent. A
raised card splitting `Il tuo saldo` (large, mint) from `Totale gruppo`
(small, right-aligned). A scrolling pill tab bar: Spese / Saldi / Pareggi /
Lista / Stats.

Then the expense list, **hairline-separated, no cards**. Each row: a 29px
rounded monogram in the payer's tint, description, `payer · date` muted, and on
the right the amount with `tua: €X,XX` under it. A scanned receipt is one row
with a cyan receipt icon and `Pietro · 12 voci · 18 lug`.

Bottom bar above the fold edge: accent pill + outline scan button.

### Group detail — balances and settle

Per member: monogram, name, signed amount, and a 5px proportional bar in mint
or coral. Then `CHI PAGA CHI` as bordered surfaces — `Giulia → Pietro €73,55`
with an inline outlined `Salda` chip. Footer: `3 movimenti per chiudere tutto`.

### Add expense (bottom sheet)

Sheet over the dimmed list, 22px top radius, grab handle. Title row with a
close X. The amount centred at ~44px, the euro sign in primary text and the
figure itself in accent. Then description field, category chips, `HA PAGATO` as
member pills with the selected one ringed in accent, and `DIVISO TRA` — with
the live per-head figure on the same line — over a 4-way segmented control
(Equamente / Importi / % / Quote). Accent pill to confirm.

**Multiple payers with different amounts** was called out here as designed
nowhere and existing anyway. It is now drawn as the second state it always was
in the code: tapping one person is a row of pills and nothing else, tapping a
second reveals the per-payer amount fields under them, with "torna" / "restano
€X" on the label line. See `src/components/payer-editor.tsx`.

### Receipt review

Header, then the reconciliation strip. Then the parsed items as hairline rows:
name, small member chips showing who splits *that line*, price. Long receipts
collapse with `+ altre 7 voci` in accent. A total row, then `HA PAGATO` and an
accent pill reading `Aggiungi 12 voci`.

---

## 5. What the redesign can rely on

All of this landed on 2026-07-30 and is deployed. Read `CLAUDE.md` for the
architecture; these are the pieces the redesign specifically needs.

- **Identity exists.** `group_access.member_id` records which member you are,
  set when redeeming an invite, when creating a group, or via the "who are
  you?" prompt on the group page. Without it none of the personal figures in
  §3 are computable. Every access row in production currently has it.
- **Money is integer cents** end to end, and `src/lib/money.ts` is the only
  boundary to euros. Splits always sum exactly; do not reintroduce tolerances.
- **Receipts are one thing** — `src/lib/receipts.ts` folds their lines back
  together for the list, the tab badge and analytics, and the `receipts` table
  owns the name, category and declared total.

**One query does not exist yet** and the new homepage needs it: your balance
across *all* your groups, joined through `group_access`. Everything it needs is
in place.

---

## 6. What shipped, and what did not

Everything in §§2–5 is implemented: tokens in both themes, the cross-group
balance query, the homepage, group detail, the expense list, both sheets,
balances, settle, shopping, analytics, empty states, and the icons.

Things landed that this document did not ask for, each because the redesign
made the existing behaviour visibly wrong:

- **The UI is in Italian**, including the user-facing strings in `splits.ts`,
  `payers.ts` and the `{ error }` returns in `actions.ts`. Every screen in §4 is
  specified in Italian and the users are Italian; leaving the interface in
  English would have meant translating the spec back.
- **Money displays with a comma.** `€89.63` reads as a typo in Italian. The
  change is inside `formatMoney` only — `formatAmount` feeds
  `<input type="number">`, whose value must stay dot-decimal or the browser
  treats the field as empty.
- **Analytics counts entries, not rows.** The "Spese" card ran
  `expenses.length`, so it read 269 where the list below it showed 123, and
  dragged the average down by the same factor. It uses `countExpenseEntries`
  now, like everything else that counts.
- **The shopping list records who added an item.** The action had always
  accepted and validated `addedByMemberId`; no caller ever sent it, so every row
  rendered "l'ha aggiunto …" against a null name.
- **`eslint` was dying of an out-of-memory error** before it reached `src`,
  because nothing ignored `.open-next` (~1400 generated files). The project's
  only automated check was silently doing nothing. Fixed in
  `eslint.config.mjs`.
- **You can add somebody to a group that already exists.** The `addMember`
  action had been there, protected, with nothing calling it, so members could
  only ever be named at creation time. The form lives under the balance list —
  the one screen that already answers "who is in this group" — and the server
  picks the colour (first shade the group is not using) and rejects a duplicate
  name. `renameReceipt`, dead for the opposite reason (`saveReceipt` already
  writes the name), was deleted along with `expense-chart.tsx`.

Found in the pre-push review of the redesign itself, and fixed:

- **The reconciliation tolerance was owned by the scanner alone.** The list and
  the receipt editor compared exactly, so a scan the scanner had accepted at one
  cent of slack came back permanently flagged as broken. `receiptReconciles` in
  `src/lib/receipts.ts` is now the single answer for all three surfaces.
- **The light theme failed WCAG AA.** `#0C8891` measured 3.8:1 as text on
  `--brand-field`, which is where accent text mostly lives. Both `--primary` and
  `--positive` were darkened; every pair the interface actually renders now
  measures ≥ 4.5:1 in both themes.
- **A net balance of zero was reported as "Sei in pari"** even when it was
  €100 owed in one group cancelling €100 owing in another — two payments still
  to make. That case now reads "In pari nel totale".

Open, and deliberately not invented:

- **"Aggiungi spesa" on the homepage.** §4 puts an accent pill there, but an
  expense needs a group and the homepage has none selected. The pill is
  **"Nuovo gruppo"** instead. Picking a group first is a flow nobody has
  designed.
- **Group emoji survived.** §2 replaced them with coloured monograms; they are
  kept, inside the tinted tile the monogram would have used, because users
  chose them by hand. The monogram is the fallback when there is no emoji.
- **The mark is settled but not closed** — see §1.

There is no test suite and no CI, so `npm run lint` and `npm run build` are the
only automated safety net; `npm run check:parser` covers the receipt parser.
Verify visually against `wrangler dev`, not `next dev` — see the deploy notes
in memory for why the latter is broken.
