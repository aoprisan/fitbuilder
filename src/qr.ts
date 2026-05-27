/* Render a routine share link as a scannable QR code. The QR is the second
   dissemination channel (alongside WhatsApp links): a trainer prints or shows
   it so students joining a group session can scan to load the routine.

   The encoder (qrcode-generator) is *lazy-imported* — same pattern as the
   XLSX/PDF import parsers — so it never weighs down the initial app load. We
   only borrow its module matrix and draw the code ourselves with the canvasKit
   palette, so it matches the Training Ledger exports. The palette is taken from
   canvasKit (theme-independent) on purpose: a QR must always be dark modules on
   a light ground to scan, regardless of the app's light/dark UI theme. */

import { C } from "./canvasKit";
import { encodeRoutineLink } from "./shareRoutine";
import type { RoutineSheet } from "./types";

/** Device-pixel scale for crisp modules on hi-dpi screens and in print. */
const SCALE = 2;
/** Quiet-zone width in modules. The spec minimum is 4; scanners need it. */
const QUIET = 4;
/** Logical (CSS px) size of one module before SCALE. */
const MODULE = 6;

/**
 * Render a routine's share link to a square QR canvas in the ledger palette.
 * Byte mode (base64url isn't QR-alphanumeric), error-correction level M, with a
 * fallback to L for large multi-routine sheets. Throws if the routine is too big
 * for even a max-size QR — the caller should fall back to the plain link.
 */
export async function renderRoutineQrCanvas(sheet: RoutineSheet): Promise<HTMLCanvasElement> {
  const qrcode = (await import("qrcode-generator")).default;
  const url = encodeRoutineLink(sheet);

  // typeNumber 0 = auto-pick the smallest version that fits. Prefer M (more
  // robust to print smudges); fall back to L (more capacity) if M overflows.
  let qr: ReturnType<typeof qrcode> | null = null;
  for (const level of ["M", "L"] as const) {
    try {
      const candidate = qrcode(0, level);
      candidate.addData(url, "Byte");
      candidate.make();
      qr = candidate;
      break;
    } catch {
      // Data exceeds this level's capacity — try the next, then give up.
    }
  }
  if (!qr) {
    throw new Error("This routine is too large for a QR code — share the link instead.");
  }

  const count = qr.getModuleCount();
  const sizePx = (count + QUIET * 2) * MODULE;

  const canvas = document.createElement("canvas");
  canvas.width = sizePx * SCALE;
  canvas.height = sizePx * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.scale(SCALE, SCALE);

  // Parchment ground (doubles as the quiet zone) + ink modules — high contrast.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, sizePx, sizePx);
  ctx.fillStyle = C.ink;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + QUIET) * MODULE, (row + QUIET) * MODULE, MODULE, MODULE);
      }
    }
  }
  return canvas;
}
