# Splitta redesign — handoff

_Written 2026-07-30, at commit `7692eea`. Everything below was designed as
rendered mockups in a chat session that no longer exists; this file is the only
record. Treat it as the specification, not as notes._

---

## 1. Two decisions block writing any code

Do not start implementing until these are answered. They were still open when
the session ended.

**Which logo mark.** The last proposal on the table was a *folded banknote
knocked out as negative space inside a filled tile* — the tile bleeds to the
edge and the shape you recognise is the void. It combined the two variants that
survived: a folded-banknote silhouette (unmistakable at any size, and the only
way to get depth in a system with no gradients or shadows) and a full-bleed
negative cut (maximum impact as a home-screen icon, but says nothing about
money on its own).

Rejected, do not revisit: **any "split S"**. A whole family of them — diagonal
slice, centre gap, split serif, division sign, uneven shares, torn edge — was
shown and dismissed as uninteresting. Also weak: two offset rectangles (a
rectangle is the least recognisable shape there is, and the banknote reading
dies at 22px) and the Venn-diagram pair (already the logo of many things).

**Dark-only, or light and dark.** Ghiaccio is designed dark-first. Shipping
dark-only halves the work and makes the app sharper; keeping both preserves
usability in daylight, which matters because this app gets used outdoors, at
tables, in the sun. The app currently has `next-themes` with both.

A third, smaller decision rides along: the current display face is **Instrument
Serif**, which does not belong in Ghiaccio. Recommendation is to drop it, set
everything in a tight grotesk, and use **Geist Mono** (already a dependency)
for every tabular figure — balances, amounts, columns.

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
counterpart does not exist yet and depends on decision 2.

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

**Not designed, and it exists:** multiple payers with different amounts. The
mockup shows a single-payer pill row. The real flow needs a second state where
tapping a second person reveals per-payer amount fields. Design it before
building.

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

## 6. Suggested order

1. Answer the two decisions in §1.
2. Tokens in `src/app/globals.css`, both themes if decision 2 says so.
3. The new cross-group balance query, then the homepage — highest visible
   payoff, and it proves the identity plumbing end to end.
4. Group detail: hero card, tabs, then the expense list. This is where the
   §2 structural rule earns its keep; if the list looks crowded, the rule is
   being broken.
5. The two sheets — add expense (including the multi-payer state) and receipt
   review.
6. Balances, settle, shopping, analytics, empty states.
7. Regenerate the icons: change `mark()` in `scripts/generate-icons.mjs` and
   run `npm run icons`. The current mark is a deliberate placeholder in the old
   terracotta and must not survive the redesign. Update `theme_color` and
   `background_color` in `src/app/manifest.ts` to the Ghiaccio values at the
   same time, and the `viewport.themeColor` pair in `src/app/layout.tsx`.

There is no test suite and no CI, so `npm run lint` and `npm run build` are the
only automated safety net; `npm run check:parser` covers the receipt parser.
Verify visually against `wrangler dev`, not `next dev` — see the deploy notes
in memory for why the latter is broken.
