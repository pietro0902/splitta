/**
 * Exercises the receipt parser on text fixtures — no browser, no OCR needed.
 * Run with: npx tsx parser-check.mts
 *
 * When a real receipt scans badly, paste its OCR text in as a new case here,
 * then tune the keyword lists / regexes in src/lib/receipt-parser.ts until it
 * passes. That keeps extraction quality a thing you can measure, not guess at.
 */
import { parseReceipt, reconcile, UNNAMED_ITEM } from "./src/lib/receipt-parser";

type Case = {
  label: string;
  text: string;
  expected: [string, number][];
  expectTotal: number | null;
  expectMatch: boolean | null;
};

const CASES: Case[] = [
  {
    label: "clean receipt: discount, quantity line, payment noise",
    text: `
ESSELUNGA SPA
VIA ROMA 12 - MILANO
P.IVA 01234567890

DOCUMENTO COMMERCIALE
di vendita o prestazione

PANE INTEGRALE           1,50
LATTE PS 1L              0,99
BISCOTTI GOCCE
2 x 1,20                 2,40
COCA COLA 1.5L           1,89
SCONTO CARTA            -0,50
PROSCIUTTO CRUDO         4,20

TOTALE COMPLESSIVO      10,48
CONTANTE                20,00
RESTO                    9,52

IVA 4%                   0,42
IVA 22%                  0,31
`,
    expected: [
      ["PANE INTEGRALE", 1.5],
      ["LATTE PS 1L", 0.99],
      ["BISCOTTI GOCCE", 2.4],
      ["COCA COLA 1.5L", 1.39],
      ["PROSCIUTTO CRUDO", 4.2],
    ],
    expectTotal: 10.48,
    expectMatch: true,
  },
  {
    label: "messy receipt: dept letters, bare EAN, lowercase kg, TOT. EURO",
    text: `
CONAD CITY
DOCUMENTO COMMERCIALE

PASTA BARILLA 500G       1,29 A
8001234567890            2,50
MOZZARELLA               2,19 A
PROMO 3X2               -1,29
PROSCIUTTO COTTO
0,450 kg x 12,90         5,81
TOT. EURO               10,50
CARTA DI CREDITO        10,50
`,
    expected: [
      ["PASTA BARILLA 500G", 1.29],
      [UNNAMED_ITEM, 2.5],
      ["MOZZARELLA", 0.9],
      ["PROSCIUTTO COTTO", 5.81],
    ],
    expectTotal: 10.5,
    expectMatch: true,
  },
  {
    label: "OCR damage: letter-for-digit price, quantity line after a full item",
    text: `
MARKET
12 UOVA FRESCHE          3,20
LATTE                    1,S0
BISCOTTI                 2,40
3 x 0,50                 1,50
TOTALE                   8,60
`,
    expected: [
      // Leading "12" is part of the name, not a code to strip.
      ["12 UOVA FRESCHE", 3.2],
      // "1,S0" recovered by the loose price pattern + digit repair.
      ["LATTE", 1.5],
      ["BISCOTTI", 2.4],
      // Quantity line follows a complete item, so it's a separate product
      // whose name OCR lost — must not overwrite BISCOTTI.
      [UNNAMED_ITEM, 1.5],
    ],
    expectTotal: 8.6,
    expectMatch: true,
  },
  {
    // Real OCR output, Trattoria Il Gabbiano. The "EURO" header followed by a
    // standalone "2X 2,00" used to invent a phantom EUR 4,00 item named EURO,
    // because the quantity line took its name from the line above.
    label: "real OCR: informational quantity line above its product",
    text: `
Trattoria I] Gabbiano
P. Iva: 01522310180

EURO
2X 2,00

Menu Carta                                 4,00
Gnocchi rosa                      10,00
Ravioli Castalmagno                   12,00
Stinco                                12,00
CONTANTI                               89,00
`,
    expected: [
      ["Menu Carta", 4],
      ["Gnocchi rosa", 10],
      ["Ravioli Castalmagno", 12],
      ["Stinco", 12],
    ],
    expectTotal: null,
    expectMatch: null,
  },
  {
    // Same receipt, but a pass where OCR lost the "x" of "2X 2,00". The line
    // then looks like a nameless EUR 2,00 item sitting above the product it
    // actually belongs to.
    label: "real OCR: quantity marker whose x didn't survive",
    text: `
Trattoria I] Gabbiano
EURO
2 2,00

Menu Carta                                 4,00
2 « 2,00
Gnocchi rosa                      10,00
2. 3,00
Vino rosso                        12,00
CONTANTI                               26,00
`,
    expected: [
      ["Menu Carta", 4],
      ["Gnocchi rosa", 10],
      ["Vino rosso", 12],
    ],
    expectTotal: null,
    expectMatch: null,
  },
  {
    // Real OCR output, Zuma. Restaurant docket format: quantity in front, unit
    // price after an @ that OCR renders as "€" or "G", line total at the right.
    label: "real OCR: quantity-first docket with @ unit prices",
    text: `
ZUMA  RESTAURANT
CHK 3288        TBL 5/1
2 water still € 12.00       24.00
8 OSHIBORI                0.00
2 Coperto G 15.00           30.00
1 seared tuna               39.00
2 special] chocolate @ 23.00 4
.    6.00
48.36 IVA 10%
Net Total:            483 CEL

145. 00EUR
`,
    expected: [
      // Quantity and unit price stripped from the name.
      ["water still", 24],
      // A zero-priced line is still a real item.
      ["8 OSHIBORI", 0],
      ["Coperto", 30],
      ["1 seared tuna", 39],
      // OCR split "46.00" across two lines, destroying the line total. The
      // "@ 23.00" with quantity 2 is enough to rebuild it.
      ["special] chocolate", 46],
      // ...and the orphaned fragment survives as an unnamed item, which is
      // what keeps the checksum honest instead of silently absorbing it.
      [UNNAMED_ITEM, 6],
    ],
    // No labelled total survived ("Net Total" is the taxable base and is
    // excluded), so the bare amount at the bottom is used instead.
    expectTotal: 145,
    expectMatch: true,
  },
  {
    label: "no printed total: checksum unavailable, items still extracted",
    text: `
BAR CENTRALE
CAFFE                    1,10
CORNETTO                 1,30
`,
    expected: [
      ["CAFFE", 1.1],
      ["CORNETTO", 1.3],
    ],
    expectTotal: null,
    expectMatch: null,
  },
];

let failures = 0;

for (const testCase of CASES) {
  const result = parseReceipt(testCase.text);
  console.log(`\n=== ${testCase.label}`);
  for (const item of result.items) {
    const flags = [
      item.discounted ? "discounted" : null,
      item.quantity ? `qty ${item.quantity}` : null,
    ].filter(Boolean).join(", ");
    console.log(
      `  ${item.name.padEnd(22)} ${item.price.toFixed(2).padStart(7)}${flags ? `   (${flags})` : ""}`
    );
  }
  console.log(
    `  -> total=${result.declaredTotal} sum=${result.itemsTotal} match=${result.totalMatches}`
  );

  if (result.items.length !== testCase.expected.length) {
    console.log(`  FAIL: expected ${testCase.expected.length} items, got ${result.items.length}`);
    failures++;
  }
  for (const [i, [name, price]] of testCase.expected.entries()) {
    const actual = result.items[i];
    if (!actual || actual.name !== name || Math.abs(actual.price - price) > 0.001) {
      console.log(
        `  FAIL item ${i}: expected "${name}" @ ${price}, got "${actual?.name}" @ ${actual?.price}`
      );
      failures++;
    }
  }
  if (result.declaredTotal !== testCase.expectTotal) {
    console.log(`  FAIL: expected total ${testCase.expectTotal}, got ${result.declaredTotal}`);
    failures++;
  }
  if (result.totalMatches !== testCase.expectMatch) {
    console.log(`  FAIL: expected match ${testCase.expectMatch}, got ${result.totalMatches}`);
    failures++;
  }
}

// --- reconcile(): picking the right pass out of several OCR attempts --------

console.log("\n=== reconcile: cross-checking multiple OCR passes");

/** Build a ParsedReceipt the way parseReceipt would, from prices and a total. */
function fakeRun(prices: number[], declaredTotal: number | null) {
  const text =
    prices.map((p, i) => `ITEM ${i}    ${p.toFixed(2)}`).join("\n") +
    (declaredTotal !== null ? `\nTOTALE COMPLESSIVO   ${declaredTotal.toFixed(2)}` : "");
  return parseReceipt(text);
}

const RECONCILE_CASES: {
  label: string;
  runs: ReturnType<typeof fakeRun>[];
  expectSum: number;
  expectTotal: number | null;
  expectMatch: boolean | null;
}[] = [
  {
    // The Gabbiano shape: every pass reads the items, only one reads the total.
    label: "total from one pass, items from another",
    runs: [fakeRun([4, 10, 12], null), fakeRun([4, 10, 12], 26)],
    expectSum: 26,
    expectTotal: 26,
    expectMatch: true,
  },
  {
    // The Zuma shape: the pass that reconciles wins over the one that doesn't,
    // even though both read a total.
    label: "prefers the pass whose items add up",
    runs: [fakeRun([24, 30, 39], 139), fakeRun([24, 30, 39, 46], 139)],
    expectSum: 139,
    expectTotal: 139,
    expectMatch: true,
  },
  {
    // Nothing reconciles: aim at the largest total, keep the closest pass.
    label: "falls back to the pass closest to the largest total",
    runs: [fakeRun([10], 50), fakeRun([10, 20, 15], null)],
    expectSum: 45,
    expectTotal: 50,
    expectMatch: false,
  },
  {
    label: "no total anywhere: keeps the pass with the most items",
    runs: [fakeRun([10], null), fakeRun([10, 20], null)],
    expectSum: 30,
    expectTotal: null,
    expectMatch: null,
  },
];

for (const testCase of RECONCILE_CASES) {
  const result = reconcile(testCase.runs);
  const ok =
    Math.abs(result.itemsTotal - testCase.expectSum) < 0.001 &&
    result.declaredTotal === testCase.expectTotal &&
    result.totalMatches === testCase.expectMatch;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${testCase.label}: sum=${result.itemsTotal} total=${result.declaredTotal} match=${result.totalMatches}`
  );
  if (!ok) failures++;
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);

// Fail loudly: without this the script exits 0 on failure and any caller
// (CI step, git hook, chained &&) reads a regression as a pass.
process.exitCode = failures === 0 ? 0 : 1;
