/**
 * Turns raw OCR text from an Italian receipt into line items.
 *
 * Pure module — no DOM, no network, no server imports. Importable from both
 * client and server code, and directly exercisable on a text fixture.
 */

export type ParsedItem = {
  name: string;
  price: number;
  /** Set when a following discount line was folded into this item's price. */
  discounted?: boolean;
  /** Set when the line carried an explicit "N x unit" quantity. */
  quantity?: number;
};

export type ParsedReceipt = {
  items: ParsedItem[];
  /** The "TOTALE" printed on the receipt, when it could be read. */
  declaredTotal: number | null;
  /** Sum of the extracted items. */
  itemsTotal: number;
  /** null when there was no declared total to check against. */
  totalMatches: boolean | null;
  /** itemsTotal - declaredTotal, rounded to cents. null without a total. */
  discrepancy: number | null;
};

/**
 * Lines that are never products. Matched as whole words against the
 * accent-stripped uppercase line, so "TOT" won't swallow "TOTANI".
 */
const NON_ITEM_KEYWORDS = [
  "TOTALE", "TOT", "SUBTOTALE", "IMPORTO", "IMPONIBILE", "CORRISPETTIVO",
  "IVA", "ESENTE", "ESENZIONE", "ALIQUOTA",
  // Sales tax in the languages that turn up on receipts from tourist areas and
  // border regions. Without these a VAT recap line becomes a purchase.
  "MWST", "MEHRWERTSTEUER", "VAT", "TVA", "BTW", "STEUER",
  "CONTANTE", "CONTANTI", "RESTO", "BANCOMAT", "POS", "ELETTRONICO",
  // Not a bare "CARTA": that is a real product word ("Menu Carta", "carta
  // forno", "carta igienica") and blacklisting it drops genuine items.
  "CARTA DI CREDITO", "CARTA CREDITO", "CARTA DI DEBITO", "PAG. CARTA",
  "PAGAMENTO", "PAGATO", "NON RISCOSSO", "ARROTONDAMENTO",
  "DOCUMENTO COMMERCIALE", "SCONTRINO", "REGISTRATORE", "MATRICOLA", "RT",
  "PARTITA IVA", "P.IVA", "PIVA", "COD.FISCALE", "CODICE FISCALE",
  "CASSA", "OPERATORE", "ADDETTO", "CASSIERE",
  // Column headers and docket metadata seen on real receipts.
  "DESCRIZIONE", "DESCR", "PREZZO", "QUANTITA", "QTA", "ARTICOLO",
  "DOCUMENTO GESTIONALE", "NET TOTAL", "SUBTOTAL", "CHK", "TBL",
  // A bare "EURO" is the price-column header, never a product.
  "EURO",
  "GRAZIE", "ARRIVEDERCI", "SCONTRINO PARLANTE",
  "PUNTI", "FIDELITY", "SALDO PUNTI", "TESSERA", "CLIENTE",
  "ARTICOLI", "PEZZI", "CAPI",
  "TEL", "TELEFONO", "VIA", "VIALE", "PIAZZA", "CORSO",
  "DATA", "ORA", "PROGRESSIVO", "SEQUENZA", "CHIUSURA", "ZREPORT",
];

/** Lines that reduce the price of the item above them. */
const DISCOUNT_KEYWORDS = [
  "SCONTO", "SCONTI", "SCONTISTICA", "PROMO", "PROMOZIONE", "OFFERTA",
  "RIDUZIONE", "ABBUONO", "BUONO", "OMAGGIO", "SALDO",
];

/** Keywords that introduce the receipt total. Ordered most to least specific. */
const TOTAL_KEYWORDS = [
  "TOTALE COMPLESSIVO", "TOTALE EURO", "TOTALE DA PAGARE", "TOTALE",
  "TOT. EURO", "TOT EURO", "TOT.", "IMPORTO PAGATO",
  // English receipts (tourist areas print these) — "TOTAL" alone covers
  // "TOTAL EUR" and "GRAND TOTAL".
  "TOTAL",
];

/**
 * Payment lines, used as a fallback source for the total. What was handed over
 * equals the bill whenever no change was given, and on a creased receipt the
 * "TOTALE" line is often the one that fails to survive OCR while the payment
 * line right below it comes through intact.
 */
const PAYMENT_KEYWORDS = [
  "CONTANTE", "CONTANTI", "CARTA DI CREDITO", "CARTA CREDITO",
  "PAGAMENTO CONTANTE", "PAGAMENTO ELETTRONICO", "IMPORTO PAGATO", "BANCOMAT",
];

/** Change-given line: if it is non-zero, the payment was more than the bill. */
const CHANGE_KEYWORDS = ["RESTO"];

/** Cent of slack for comparing a sum against a printed total. */
const TOTAL_TOLERANCE = 0.015;

/**
 * Words that disqualify a line from being *the* total even though it contains a
 * total keyword: a VAT recap restates a tax slice, and "Net Total" is the
 * taxable base, which is smaller than what was actually paid.
 */
const NOT_THE_TOTAL = /\b(IVA|VAT|NET|IMPONIBILE)\b/;

/**
 * A price at the end of a line: "1,50", "-0,96", "12.99", optionally trailed
 * by a VAT/department marker ("1,50 A", "1,50 22", "1,50 *").
 */
// `\s*` around the separator: OCR sprays stray spaces into numbers, and
// "532. 00EUR" is a total that would otherwise go unread.
const TRAILING_PRICE = /(-?\d{1,5}\s*[.,]\s*\d{2})\s*[A-Z*€]{0,3}\s*$/;

/**
 * A line that is nothing but an amount. Near the end of a receipt these are
 * the total or a payment restatement printed without a label — never products.
 */
const AMOUNT_ONLY = /^[\s€$*]*(-?\d{1,5}\s*[.,]\s*\d{2})\s*(?:EUR|EURO|€|\$)?\s*$/i;

/** Fraction of the receipt after which an unlabelled amount is bookkeeping. */
const TAIL_FROM = 0.6;

/**
 * Same shape, but tolerating the letters OCR substitutes for digits on faded
 * thermal print. Only tried when the strict pattern finds nothing, so a
 * cleanly-read line is never reinterpreted — this recovers "1,S0" instead of
 * dropping the item, without loosening the common case.
 */
const TRAILING_PRICE_LOOSE =
  /(-?[\dOoQlI|SsBbZz]{1,5}[.,][\dOoQlI|SsBbZz]{2})\s*[A-Z*€]{0,3}\s*$/;

function matchTrailingPrice(line: string): RegExpMatchArray | null {
  return line.match(TRAILING_PRICE) ?? line.match(TRAILING_PRICE_LOOSE);
}

/**
 * "2 water still @ 12.00" — quantity in front, unit price after an @ marker,
 * line total further right (the caller strips it before matching). Common on
 * restaurant dockets. OCR frequently reads "@" as "6" or "€", and sometimes
 * glues a stray character to it, so both are tolerated.
 */
// The "@" marker: literal @/€ may sit flush against the name, but the letters
// OCR substitutes for it (6, G, E, e) must stand alone as their own token —
// otherwise the trailing "e" of "chocolate" is read as the marker and eaten.
const AT_MARKER = String.raw`(?:\s[6GEe]|\s*[@€])`;

const QTY_AT_UNIT_PRICE = new RegExp(
  String.raw`^\s*(\d{1,3})\s+(.+?)${AT_MARKER}[^\d]{0,3}\d{1,4}[.,]\d{2}\s*$`
);

/**
 * Same shape without the end anchor, for when OCR mangles the line total but
 * leaves "N name @ unit" intact ("2 special chocolate @ 23.00 4" — the 46.00
 * was split across two lines). The total is then reconstructable as N × unit.
 */
const QTY_AT_UNIT_LOOSE = new RegExp(
  String.raw`^\s*(\d{1,3})\s+(.+?)${AT_MARKER}[^\d]{0,3}(\d{1,4}[.,]\d{2})`
);

/** "2 x 1,20" / "2X1,20" / "0,450 kg x 12,90" — a quantity line. */
const QUANTITY_LINE =
  /^\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:KG|GR|G|LT|L|PZ)?\s*[x*]\s*(\d{1,5}[.,]\d{2})/i;

/**
 * Everything before the price is just a small count — "2X", "2 x", "2", "2." —
 * so the line is a quantity marker printed above its product, not an item of
 * its own. QUANTITY_LINE catches these only when the "x" survives OCR; on a
 * faded receipt it often doesn't, and the line then looks like a nameless
 * EUR 2,00 purchase. Capped at three digits so a smudged EAN still becomes a
 * real (unnamed) item rather than being silently dropped.
 */
const BARE_QUANTITY = /^\s*\d{1,3}\s*(?:[xX×*]|[^A-Za-z0-9]{1,2})?\s*$/;

/** Standalone numeric codes (EAN, department numbers) that aren't names. */
const CODE_ONLY = /^[\d\s.\-*#/]+$/;

/** Placeholder for a priced line whose name OCR couldn't recover. */
export const UNNAMED_ITEM = "Unnamed item";

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalize(line: string): string {
  return stripAccents(line).toUpperCase().replace(/\s+/g, " ").trim();
}

/**
 * OCR reads thermal-printed digits loosely. Repair the characters that get
 * confused inside a number, without touching product names.
 */
function repairNumber(raw: string): string {
  return raw
    .replace(/[OoQ]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[Zz]/g, "2");
}

function toAmount(raw: string): number | null {
  const cleaned = repairNumber(raw).replace(/\s/g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function containsKeyword(normalized: string, keywords: string[]): boolean {
  return keywords.some((keyword) => {
    // Escape regex metacharacters (P.IVA, TOT., COD.FISCALE contain dots).
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`).test(normalized);
  });
}

/**
 * Finds the receipt total and the index of the line carrying it. Everything at
 * or after that line is payment/tax bookkeeping, never products.
 */
function findTotal(lines: string[]): { value: number | null; index: number } {
  // Search bottom-up: the real total sits near the end, and "TOTALE" can also
  // appear in a header or a loyalty message earlier in the receipt.
  for (let i = lines.length - 1; i >= 0; i--) {
    const normalized = normalize(lines[i]);
    if (!containsKeyword(normalized, TOTAL_KEYWORDS)) continue;
    if (NOT_THE_TOTAL.test(normalized)) continue;

    const match = matchTrailingPrice(lines[i]);
    if (match) {
      const value = toAmount(match[1]);
      if (value !== null && value > 0) return { value, index: i };
    }
  }

  // Nothing labelled as a total survived. Fall back to what was paid, but only
  // when no change was given — otherwise the payment exceeds the bill.
  const changeGiven = lines.some((line) => {
    const normalized = normalize(line);
    if (!containsKeyword(normalized, CHANGE_KEYWORDS)) return false;
    const match = matchTrailingPrice(line);
    const value = match ? toAmount(match[1]) : null;
    return value !== null && value > 0.01;
  });
  if (changeGiven) return { value: null, index: -1 };

  for (let i = lines.length - 1; i >= 0; i--) {
    const normalized = normalize(lines[i]);
    if (!containsKeyword(normalized, PAYMENT_KEYWORDS)) continue;
    const match = matchTrailingPrice(lines[i]);
    if (match) {
      const value = toAmount(match[1]);
      if (value !== null && value > 0) return { value, index: i };
    }
  }
  return { value: null, index: -1 };
}

function cleanName(raw: string): string {
  return raw
    // Drop leading EAN/barcode digits: "2001234567890 LATTE". Requires 4+ digits
    // so real name prefixes survive — "12 UOVA" and "500 GR PASTA" are product
    // names, not codes.
    .replace(/^\s*[\d*#]{4,}\s+/, "")
    // Collapse the dot/space leaders that pad the gap before the price.
    .replace(/[.\s_-]{3,}$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseReceipt(text: string): ParsedReceipt {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const { value: declaredTotal, index: totalIndex } = findTotal(rawLines);
  // Products live above the total line; below it is payment bookkeeping.
  const body = totalIndex >= 0 ? rawLines.slice(0, totalIndex) : rawLines;

  const items: ParsedItem[] = [];
  // Unlabelled amounts printed near the bottom — candidates for the total when
  // no keyword line survived OCR.
  const tailAmounts: number[] = [];
  const tailStart = Math.floor(body.length * TAIL_FROM);

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const normalized = normalize(line);

    if (normalized.length < 2) continue;

    // A bare amount in the tail is the total or a payment echo, not an item.
    const amountOnly = line.match(AMOUNT_ONLY);
    if (amountOnly && i >= tailStart) {
      const value = toAmount(amountOnly[1]);
      if (value !== null && value > 0) tailAmounts.push(value);
      continue;
    }

    const priceMatch = matchTrailingPrice(line);
    const quantityMatch = line.match(QUANTITY_LINE);

    // --- Discount line: fold into the item above it -----------------------
    const isDiscountKeyword = containsKeyword(normalized, DISCOUNT_KEYWORDS);
    const priceValue = priceMatch ? toAmount(priceMatch[1]) : null;
    const isNegative = priceValue !== null && priceValue < 0;

    if ((isDiscountKeyword || isNegative) && priceValue !== null) {
      const target = items[items.length - 1];
      if (target) {
        target.price = roundCents(target.price - Math.abs(priceValue));
        target.discounted = true;
        if (target.price < 0) target.price = 0;
      }
      continue;
    }

    // --- Quantity line: "2 x 1,20" ----------------------------------------
    if (quantityMatch) {
      const quantity = toAmount(quantityMatch[1]);
      const unitPrice = toAmount(quantityMatch[2]);

      // The line total may be printed at the far right ("2 x 1,20    2,40").
      // Trust it when present; otherwise multiply.
      const rest = line.slice(quantityMatch[0].length);
      const restPrice = matchTrailingPrice(rest);
      const lineTotal =
        restPrice !== null
          ? toAmount(restPrice[1])
          : quantity !== null && unitPrice !== null
            ? roundCents(quantity * unitPrice)
            : null;

      if (lineTotal === null) continue;

      // The product name is usually on the preceding line, which had no price.
      const previousRaw = i > 0 ? cleanName(body[i - 1]) : "";
      const previousHadPrice = i > 0 && matchTrailingPrice(body[i - 1]) !== null;
      const previousIsNoise =
        i > 0 && containsKeyword(normalize(body[i - 1]), NON_ITEM_KEYWORDS);
      const previousIsName =
        !previousHadPrice &&
        !previousIsNoise &&
        previousRaw.length > 0 &&
        !CODE_ONLY.test(previousRaw);

      if (restPrice !== null) {
        // The line carries its own total, so it *is* the item. Name it from the
        // line above when that line was a bare product name.
        items.push({
          name: previousIsName ? previousRaw : UNNAMED_ITEM,
          price: lineTotal,
          quantity: quantity ?? undefined,
        });
      } else if (previousIsName) {
        // "PANE" / "2 x 1,20" — no total printed, so multiply.
        items.push({
          name: previousRaw,
          price: lineTotal,
          quantity: quantity ?? undefined,
        });
      }
      // Otherwise this is an informational quantity line printed *above* its
      // product ("2 X 2,00" then "Menu Carta  4,00"): the price belongs to the
      // line below, which is parsed on its own. Emitting anything here would
      // invent a phantom item — which is how a column header once became a
      // EUR 4.00 expense.
      continue;
    }

    // --- Bookkeeping / header noise ---------------------------------------
    if (containsKeyword(normalized, NON_ITEM_KEYWORDS)) continue;

    // --- Regular item line ------------------------------------------------
    // Zero-priced lines are real items (a comped cover charge, "8 OSHIBORI
    // 0.00"): keeping them costs nothing in the total and preserves the
    // receipt's line count.
    if (priceMatch && priceValue !== null && priceValue >= 0) {
      const raw = line.slice(0, priceMatch.index);
      const unitPriced = raw.match(QTY_AT_UNIT_PRICE);
      const name = cleanName(unitPriced ? unitPriced[2] : raw);
      // Keep priced lines whose name didn't survive OCR (bare EAN codes, smudged
      // text) under a placeholder rather than dropping them: silently discarding
      // a real line would break the total checksum, which is the one signal the
      // user has that the scan is complete. They can rename it in review.
      const usable = name && !CODE_ONLY.test(name) && name.length >= 2;

      // A bare count above a priced line is that line's quantity, not a
      // separate purchase: "2X 2,00" sitting above "Menu Carta 4,00".
      // Not conditioned on the name being unusable: OCR debris like "2 «" reads
      // as a perfectly good name by the usual test, yet BARE_QUANTITY already
      // guarantees there is no real product word here.
      const nextHasPrice =
        i + 1 < body.length && matchTrailingPrice(body[i + 1]) !== null;
      if (BARE_QUANTITY.test(raw) && nextHasPrice) continue;

      items.push({
        name: usable ? name : UNNAMED_ITEM,
        price: priceValue,
        quantity: unitPriced ? toAmount(unitPriced[1]) ?? undefined : undefined,
      });
      continue;
    }

    // No readable line total, but the line still spells out quantity and unit
    // price — rebuild it rather than dropping a real item.
    const rebuilt = line.match(QTY_AT_UNIT_LOOSE);
    if (rebuilt) {
      const count = toAmount(rebuilt[1]);
      const unit = toAmount(rebuilt[3]);
      if (count !== null && unit !== null && count > 0 && unit > 0) {
        const name = cleanName(rebuilt[2]);
        const usable = name.length >= 2 && !CODE_ONLY.test(name);
        items.push({
          name: usable ? name : UNNAMED_ITEM,
          price: roundCents(count * unit),
          quantity: count,
        });
      }
    }
    // Lines without a price are either a name awaiting a quantity line
    // (handled above) or noise. Either way, nothing to emit here.
  }

  const itemsTotal = roundCents(items.reduce((sum, item) => sum + item.price, 0));

  // Fall back to the largest unlabelled amount in the tail when the labelled
  // total didn't survive OCR — on a crumpled receipt "TOTALE" often doesn't.
  // Only accept one at least as large as the items, which rules out change due
  // and partial payments; a total below its own line items is not a total.
  let total = declaredTotal;
  if (total === null && tailAmounts.length > 0) {
    const candidate = Math.max(...tailAmounts);
    if (candidate >= itemsTotal) total = candidate;
  }

  return withTotal({ items, itemsTotal }, total);
}

/** Assembles the checksum fields for a set of items against a candidate total. */
function withTotal(
  base: { items: ParsedItem[]; itemsTotal: number },
  total: number | null
): ParsedReceipt {
  const discrepancy = total !== null ? roundCents(base.itemsTotal - total) : null;
  return {
    items: base.items,
    declaredTotal: total,
    itemsTotal: base.itemsTotal,
    totalMatches: discrepancy === null ? null : Math.abs(discrepancy) <= TOTAL_TOLERANCE,
    discrepancy,
  };
}

/**
 * Picks the best result across several OCR passes of the same receipt.
 *
 * Different preprocessing settings fail in different places — one pass reads
 * every line but loses the total, another reads the total but drops items.
 * Measured on four real receipts, no single pass was best on all of them, but
 * combining them recovered every price on every one.
 *
 * The receipt's own printed total is the referee: if some pass's items sum
 * exactly to a total that *any* pass managed to read, those items are almost
 * certainly complete — a wrong set of line items summing to the penny is not
 * something OCR noise produces. That total is then attached to the winner even
 * when the winning pass never read it itself.
 */
/**
 * Drops a line item that is really the receipt total.
 *
 * When the "TOTALE" label doesn't survive OCR — routine on a creased receipt —
 * the amount beside it still does, and lands as a nameless item worth the whole
 * bill. Observed on two different receipts: items summing to exactly the total,
 * plus the total itself, doubling the sum and making a correct pass look like
 * the worst one.
 *
 * Only fires when there are other items and when removing it moves the sum
 * closer to the total, so a genuine single-item receipt is never gutted.
 */
function withoutTotalAsItem(run: ParsedReceipt, total: number): ParsedReceipt {
  if (run.items.length < 2) return run;

  // Relative tolerance: OCR routinely misreads the cents of a large amount
  // (85.00 read as 85.09), and an exact match would miss those.
  const tolerance = Math.max(0.02, total * 0.01);
  const index = run.items.findIndex((item) => Math.abs(item.price - total) <= tolerance);
  if (index < 0) return run;

  const items = run.items.filter((_, i) => i !== index);
  const itemsTotal = roundCents(items.reduce((sum, item) => sum + item.price, 0));
  if (Math.abs(itemsTotal - total) >= Math.abs(run.itemsTotal - total)) return run;

  return { ...run, items, itemsTotal };
}

export function reconcile(runs: ParsedReceipt[]): ParsedReceipt {
  const usable = runs.filter((run) => run.items.length > 0);
  if (usable.length === 0) return runs[0] ?? withTotal({ items: [], itemsTotal: 0 }, null);

  // Totals come from *every* run, including ones that found no items at all: a
  // pass can read the total cleanly and still lose the item column, and that
  // total is exactly what lets another pass be verified.
  const totals = runs
    .map((run) => run.declaredTotal)
    .filter((total): total is number => total !== null);

  // Strip the total-as-an-item before judging anything: otherwise a pass that
  // read every line correctly scores as the furthest from the truth.
  const target = totals.length > 0 ? Math.max(...totals) : null;
  const cleaned =
    target !== null ? usable.map((run) => withoutTotalAsItem(run, target)) : usable;

  // 1. Provably consistent: items reconcile against a total someone read.
  for (const run of cleaned) {
    for (const total of totals) {
      if (Math.abs(run.itemsTotal - total) <= TOTAL_TOLERANCE) {
        return withTotal(run, total);
      }
    }
  }

  // 2. Nothing reconciles. Aim at the largest total seen — missing items only
  //    ever pull a sum below the truth — and keep the pass closest to it.
  if (target !== null) {
    const best = cleaned.reduce((a, b) =>
      Math.abs(b.itemsTotal - target) < Math.abs(a.itemsTotal - target) ? b : a
    );
    return withTotal(best, target);
  }

  // 3. No total anywhere: the pass that found the most items is the best guess,
  //    and the UI will say the scan couldn't be verified.
  return cleaned.reduce((a, b) => (b.items.length > a.items.length ? b : a));
}
