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
 * Words that disqualify a line from being *the* total even though it contains a
 * total keyword: a VAT recap restates a tax slice, and "Net Total" is the
 * taxable base, which is smaller than what was actually paid.
 */
const NOT_THE_TOTAL = /\b(IVA|VAT|NET|IMPONIBILE)\b/;

/**
 * A price at the end of a line: "1,50", "-0,96", "12.99", optionally trailed
 * by a VAT/department marker ("1,50 A", "1,50 22", "1,50 *").
 */
const TRAILING_PRICE = /(-?\d{1,5}[.,]\d{2})\s*[A-Z*€]{0,3}\s*$/;

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
const QTY_AT_UNIT_PRICE = /^\s*(\d{1,3})\s+(.+?)\s*[@€6GEe][^\d]{0,3}\d{1,4}[.,]\d{2}\s*$/;

/** "2 x 1,20" / "2X1,20" / "0,450 kg x 12,90" — a quantity line. */
const QUANTITY_LINE =
  /^\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:KG|GR|G|LT|L|PZ)?\s*[x*]\s*(\d{1,5}[.,]\d{2})/i;

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

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const normalized = normalize(line);

    if (normalized.length < 2) continue;

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
      items.push({
        name: usable ? name : UNNAMED_ITEM,
        price: priceValue,
        quantity: unitPriced ? toAmount(unitPriced[1]) ?? undefined : undefined,
      });
    }
    // Lines without a price are either a name awaiting a quantity line
    // (handled above) or noise. Either way, nothing to emit here.
  }

  const itemsTotal = roundCents(items.reduce((sum, item) => sum + item.price, 0));
  const discrepancy =
    declaredTotal !== null ? roundCents(itemsTotal - declaredTotal) : null;

  return {
    items,
    declaredTotal,
    itemsTotal,
    // One cent of slack absorbs the receipt's own rounding.
    totalMatches: discrepancy === null ? null : Math.abs(discrepancy) <= 0.01,
    discrepancy,
  };
}
