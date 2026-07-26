/**
 * Exercises the receipt parser on text fixtures — no browser, no OCR needed.
 * Run with: npx tsx parser-check.mts
 *
 * When a real receipt scans badly, paste its OCR text in as a new case here,
 * then tune the keyword lists / regexes in src/lib/receipt-parser.ts until it
 * passes. That keeps extraction quality a thing you can measure, not guess at.
 */
import { parseReceipt, UNNAMED_ITEM } from "./src/lib/receipt-parser";

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

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
