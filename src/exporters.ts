import { dataUrlToBytes, jpegToPdf } from "./pdf";
import { renderSheetToCanvas } from "./sheetRender";
import type { RoutineSheet } from "./types";
import { slug } from "./util";

// Web Share API (Level 2, with files) isn't in every lib.dom version; describe
// just what we use so the code type-checks and degrades gracefully.
interface ShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

function shareNav(): ShareCapableNavigator {
  return navigator as unknown as ShareCapableNavigator;
}

/** True when the platform can share files (i.e. the phone share sheet is available). */
export function canShareFiles(): boolean {
  const nav = shareNav();
  return typeof nav.share === "function" && typeof nav.canShare === "function";
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image."))),
      type,
      quality,
    );
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pdfBlobFromCanvas(canvas: HTMLCanvasElement): Blob {
  const jpeg = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92));
  const bytes = jpegToPdf(jpeg, canvas.width, canvas.height);
  // Copy into a fresh ArrayBuffer so the Blob part is a plain ArrayBuffer.
  return new Blob([bytes.slice()], { type: "application/pdf" });
}

/** Render the sheet and download it as a PNG. */
export async function exportSheetPng(sheet: RoutineSheet): Promise<void> {
  const canvas = await renderSheetToCanvas(sheet);
  const blob = await canvasToBlob(canvas, "image/png");
  downloadBlob(blob, `${slug(sheet.name)}.png`);
}

/** Render the sheet and download it as a PDF. */
export async function exportSheetPdf(sheet: RoutineSheet): Promise<void> {
  const canvas = await renderSheetToCanvas(sheet);
  downloadBlob(pdfBlobFromCanvas(canvas), `${slug(sheet.name)}.pdf`);
}

export type ShareResult = "shared" | "downloaded";

/**
 * Share the sheet as a PNG via the native share sheet (best on phones, where it
 * can target WhatsApp directly). Falls back to a PNG download when the platform
 * can't share files. A user-cancelled share counts as "shared" (no fallback).
 */
export async function shareSheet(sheet: RoutineSheet): Promise<ShareResult> {
  const canvas = await renderSheetToCanvas(sheet);
  const blob = await canvasToBlob(canvas, "image/png");
  const file = new File([blob], `${slug(sheet.name)}.png`, { type: "image/png" });

  const nav = shareNav();
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: sheet.name, text: sheet.name });
      return "shared";
    } catch (err) {
      // The user dismissing the share sheet rejects with AbortError — that's
      // a completed interaction, not a failure, so don't double up with a download.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
      // Anything else (rare): fall through to a download.
    }
  }

  downloadBlob(blob, file.name);
  return "downloaded";
}
