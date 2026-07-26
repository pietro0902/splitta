"use client";

/**
 * Browser-side OCR for receipt photos. Runs Tesseract (WASM) on the user's
 * device — no server, no API key, no per-scan cost, and the photo never leaves
 * the phone.
 *
 * Client-only: touches canvas and downloads the WASM/traineddata bundles.
 * Import it from a client component and call it from an event handler, so the
 * ~5 MB of Tesseract assets load on demand rather than in the initial bundle.
 */

export type OcrProgress = {
  /** 0..1 across the whole pipeline (preprocess + download + recognize). */
  ratio: number;
  label: string;
};

/**
 * Sauvola local adaptive threshold, in place.
 *
 * A single global cut (Otsu) assumes even lighting; a receipt is usually
 * crumpled and lit from one side, so one threshold blows out the bright half
 * and fills the shadowed half with noise. Sauvola picks a threshold per pixel
 * from the local mean and standard deviation:
 *
 *   T(x,y) = mean * (1 + k * (stddev / R - 1))
 *
 * Measured against the previous global Otsu on three real receipts: same or
 * better price recovery, and it stopped inventing spurious line items.
 *
 * Window mean/variance come from integral images, so cost is independent of
 * window size. `sum` fits in Uint32 (pixels * 255 stays under 2^32 for any
 * image this pipeline produces); the squares need Float64.
 */
function sauvolaThreshold(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  k = 0.2
): void {
  // ~2.5% of the short edge: wide enough to span a stroke and its background,
  // narrow enough to track shading across the receipt. Forced odd.
  const window = Math.max(15, (Math.round(Math.min(width, height) / 40) | 1));
  const radius = Math.floor(window / 2);

  const stride = width + 1;
  const sum = new Uint32Array(stride * (height + 1));
  const sqsum = new Float64Array(stride * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    let rowSq = 0;
    for (let x = 0; x < width; x++) {
      const value = gray[y * width + x];
      rowSum += value;
      rowSq += value * value;
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + rowSum;
      sqsum[(y + 1) * stride + x + 1] = sqsum[y * stride + x + 1] + rowSq;
    }
  }

  const R = 128;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const count = (x1 - x0) * (y1 - y0);

      const s =
        sum[y1 * stride + x1] - sum[y0 * stride + x1] -
        sum[y1 * stride + x0] + sum[y0 * stride + x0];
      const sq =
        sqsum[y1 * stride + x1] - sqsum[y0 * stride + x1] -
        sqsum[y1 * stride + x0] + sqsum[y0 * stride + x0];

      const mean = s / count;
      const stddev = Math.sqrt(Math.max(0, sq / count - mean * mean));
      const threshold = mean * (1 + k * (stddev / R - 1));

      gray[y * width + x] = gray[y * width + x] > threshold ? 255 : 0;
    }
  }
}

/**
 * Thermal receipts are low-contrast and often photographed at an angle.
 * Tesseract wants dark text on a clean white field at roughly 300 DPI, so we
 * upscale small photos, drop to grayscale, stretch the contrast, and binarize.
 */
async function preprocess(
  file: File,
  targetLongEdge = 2000
): Promise<HTMLCanvasElement> {
  // "from-image" is required: phone photos carry EXIF rotation, and a bitmap
  // decoded without it reaches the recognizer sideways — which reads as a
  // total OCR failure while the preview (decoded elsewhere) looks upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  // Scale toward the target in both directions. Past ~300 DPI equivalent the
  // recognizer gains no accuracy but pays for every pixel, so a 12 MP phone
  // photo must come down as surely as a small one goes up.
  const factor = Math.min(targetLongEdge / Math.max(bitmap.width, bitmap.height), 3);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * factor);
  canvas.height = Math.round(bitmap.height * factor);

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const width = canvas.width;
  const height = canvas.height;

  // Grayscale (luma).
  const gray = new Uint8ClampedArray(pixels.length / 4);
  for (let i = 0, g = 0; i < pixels.length; i += 4, g++) {
    gray[g] = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) | 0;
  }

  sauvolaThreshold(gray, width, height);

  for (let i = 0, g = 0; i < pixels.length; i += 4, g++) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = gray[g];
    pixels[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  // Hand back the canvas itself — Tesseract accepts it directly, so there's no
  // reason to PNG-encode it into a multi-megabyte base64 string it would only
  // have to decode again.
  return canvas;
}

/**
 * Recognizes the text of a receipt photo. Resolves with the raw OCR text —
 * feed it to `parseReceipt` to get line items.
 */
export async function recognizeReceipt(
  file: File,
  onProgress?: (progress: OcrProgress) => void
): Promise<string> {
  onProgress?.({ ratio: 0.05, label: "Preparing image" });
  const processed = await preprocess(file);

  onProgress?.({ ratio: 0.15, label: "Loading recognizer" });
  const { createWorker, PSM } = await import("tesseract.js");

  // Tesseract logs progress many times per second. Forwarding every event would
  // schedule a React render per tick against work that is already saturating
  // the device, so only report whole-percent changes.
  let lastReported = -1;

  const worker = await createWorker("ita", 1, {
    logger: (message: { status: string; progress: number }) => {
      if (message.status === "recognizing text") {
        // Recognition owns the back 70% of the bar.
        const ratio = 0.3 + message.progress * 0.7;
        const percent = Math.round(ratio * 100);
        if (percent === lastReported) return;
        lastReported = percent;
        onProgress?.({ ratio, label: "Reading receipt" });
      } else if (message.status.startsWith("loading")) {
        onProgress?.({ ratio: 0.15, label: "Loading recognizer" });
      }
    },
  });

  try {
    await worker.setParameters({
      // Receipts are one column of variable-size lines.
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
      // Without this the gap between item name and price collapses and the
      // price stops being reliably at end-of-line.
      preserve_interword_spaces: "1",
    });

    const { data } = await worker.recognize(processed);
    onProgress?.({ ratio: 1, label: "Done" });
    return data.text;
  } finally {
    await worker.terminate();
  }
}
