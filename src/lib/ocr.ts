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
 * Thermal receipts are low-contrast and often photographed at an angle.
 * Tesseract wants dark text on a clean white field at roughly 300 DPI, so we
 * upscale small photos, drop to grayscale, stretch the contrast, and binarize.
 */
async function preprocess(file: File, targetLongEdge = 2000): Promise<string> {
  const bitmap = await createImageBitmap(file);

  const scale = targetLongEdge / Math.max(bitmap.width, bitmap.height);
  // Upscale small photos; never downscale below the source (detail is what
  // the recognizer needs most, and the file is already local).
  const factor = scale > 1 ? Math.min(scale, 3) : 1;

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

  // Grayscale (luma) + histogram, in one pass.
  const histogram = new Uint32Array(256);
  const gray = new Uint8ClampedArray(pixels.length / 4);
  for (let i = 0, g = 0; i < pixels.length; i += 4, g++) {
    const value =
      (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) | 0;
    gray[g] = value;
    histogram[value]++;
  }

  // Otsu's method: pick the threshold that maximizes between-class variance.
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) ** 2;

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  // Soft binarization: a hard cut at the threshold erases thin strokes on
  // faded thermal print, so ramp across a band around it instead.
  const band = 28;
  const low = threshold - band;
  const high = threshold + band;
  for (let i = 0, g = 0; i < pixels.length; i += 4, g++) {
    const value = gray[g];
    let out: number;
    if (value <= low) out = 0;
    else if (value >= high) out = 255;
    else out = ((value - low) / (high - low)) * 255;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = out;
    pixels[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  return canvas.toDataURL("image/png");
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
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("ita", 1, {
    logger: (message: { status: string; progress: number }) => {
      if (message.status === "recognizing text") {
        // Recognition owns the back 70% of the bar.
        onProgress?.({
          ratio: 0.3 + message.progress * 0.7,
          label: "Reading receipt",
        });
      } else if (message.status.startsWith("loading")) {
        onProgress?.({ ratio: 0.15, label: "Loading recognizer" });
      }
    },
  });

  try {
    await worker.setParameters({
      // Receipts are one column of variable-size lines.
      tessedit_pageseg_mode: "4" as never,
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
