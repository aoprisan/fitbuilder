import { dataUrlToBytes, jpegToPdf } from "./pdf";
import { renderSessionToCanvas } from "./sessionRender";
import { renderSheetToCanvas } from "./sheetRender";
import { renderStatsToCanvas } from "./statsRender";
import type { ProgressFilter } from "./stats";
import type { RoutineSheet, TrainingSession } from "./types";
import { sessionsToJson, sessionsToXml, slug } from "./util";

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

/** Date-stamped filename for a session archive, e.g. "gym-log-sessions-2026-05-22.json". */
function sessionsFilename(ext: string): string {
  return `gym-log-sessions-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** Download every logged session as a single JSON archive. */
export function exportSessionsJson(sessions: TrainingSession[]): void {
  const blob = new Blob([sessionsToJson(sessions)], { type: "application/json" });
  downloadBlob(blob, sessionsFilename("json"));
}

/** Download every logged session as a single XML archive. */
export function exportSessionsXml(sessions: TrainingSession[]): void {
  const blob = new Blob([sessionsToXml(sessions)], { type: "application/xml" });
  downloadBlob(blob, sessionsFilename("xml"));
}

/** Download a rendered canvas as a PNG. */
async function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await canvasToBlob(canvas, "image/png");
  downloadBlob(blob, filename);
}

/** Download a rendered canvas as a (JPEG-in-)PDF. */
function downloadCanvasPdf(canvas: HTMLCanvasElement, filename: string): void {
  downloadBlob(pdfBlobFromCanvas(canvas), filename);
}

export type ShareResult = "shared" | "downloaded";

/**
 * Share a rendered canvas as a PNG via the native share sheet (best on phones,
 * where it can target WhatsApp directly). Falls back to a PNG download when the
 * platform can't share files. A user-cancelled share counts as "shared".
 */
async function shareCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  title: string,
): Promise<ShareResult> {
  const blob = await canvasToBlob(canvas, "image/png");
  const file = new File([blob], filename, { type: "image/png" });

  const nav = shareNav();
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text: title });
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

/** Render the sheet and download it as a PNG. */
export async function exportSheetPng(sheet: RoutineSheet): Promise<void> {
  await downloadCanvasPng(await renderSheetToCanvas(sheet), `${slug(sheet.name)}.png`);
}

/** Render the sheet and download it as a PDF. */
export async function exportSheetPdf(sheet: RoutineSheet): Promise<void> {
  downloadCanvasPdf(await renderSheetToCanvas(sheet), `${slug(sheet.name)}.pdf`);
}

/** Share the sheet as a PNG (native share sheet, PNG-download fallback). */
export async function shareSheet(sheet: RoutineSheet): Promise<ShareResult> {
  return shareCanvas(await renderSheetToCanvas(sheet), `${slug(sheet.name)}.png`, sheet.name);
}

/** Slug for a session recap file, e.g. "push-day-recap". */
function sessionSlug(session: TrainingSession): string {
  return `${slug(session.name || "session")}-recap`;
}

/** Render a live-session recap (effort + exercises) and download it as a PNG. */
export async function exportSessionPng(
  session: TrainingSession,
  allSessions: TrainingSession[],
): Promise<void> {
  await downloadCanvasPng(await renderSessionToCanvas(session, allSessions), `${sessionSlug(session)}.png`);
}

/** Render a live-session recap and download it as a PDF. */
export async function exportSessionPdf(
  session: TrainingSession,
  allSessions: TrainingSession[],
): Promise<void> {
  downloadCanvasPdf(await renderSessionToCanvas(session, allSessions), `${sessionSlug(session)}.pdf`);
}

/** Share a live-session recap as a PNG (native share sheet, download fallback). */
export async function shareSession(
  session: TrainingSession,
  allSessions: TrainingSession[],
): Promise<ShareResult> {
  return shareCanvas(
    await renderSessionToCanvas(session, allSessions),
    `${sessionSlug(session)}.png`,
    session.name || "Session recap",
  );
}

/** Date-stamped filename for a stats report, e.g. "gym-stats-2026-05-22". */
function statsSlug(): string {
  return `gym-stats-${new Date().toISOString().slice(0, 10)}`;
}

/** Render the stats report for a scope and download it as a PNG. */
export async function exportStatsPng(
  sessions: TrainingSession[],
  filter: ProgressFilter,
): Promise<void> {
  await downloadCanvasPng(await renderStatsToCanvas(sessions, filter), `${statsSlug()}.png`);
}

/** Render the stats report and download it as a PDF. */
export async function exportStatsPdf(
  sessions: TrainingSession[],
  filter: ProgressFilter,
): Promise<void> {
  downloadCanvasPdf(await renderStatsToCanvas(sessions, filter), `${statsSlug()}.pdf`);
}

/** Share the stats report as a PNG (native share sheet, download fallback). */
export async function shareStats(
  sessions: TrainingSession[],
  filter: ProgressFilter,
): Promise<ShareResult> {
  return shareCanvas(await renderStatsToCanvas(sessions, filter), `${statsSlug()}.png`, "Training stats");
}
