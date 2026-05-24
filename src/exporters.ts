import { dataUrlToBytes, jpegToPdf } from "./pdf";
import { renderSessionToCanvas } from "./sessionRender";
import { renderSheetToCanvas } from "./sheetRender";
import { renderStatsToCanvas } from "./statsRender";
import type { ProgressFilter } from "./stats";
import type { RoutineSheet, TrainingSession } from "./types";
import { sessionsToJson, sessionsToMarkdown, sessionsToXml, slug } from "./util";

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

/** A fresh Claude chat. Opens the Claude app via universal links if installed, else the browser. */
const CLAUDE_NEW_CHAT_URL = "https://claude.ai/new";

export type AnalyzeResult = "shared" | "copied-opened" | "copied" | "downloaded";

/** Copy text to the clipboard, falling back to a hidden textarea for older webviews. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the execCommand path below.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Hand a Markdown report to an agent for analysis. On phones the OS share sheet
 * is the primary path (it owns the tap's user gesture, and picking Claude opens
 * a new chat pre-filled with the log). On desktop, where text sharing usually
 * isn't available, fall back to copying the report and opening a fresh Claude
 * chat. A dismissed share counts as done; a blocked popup still counts as a copy;
 * and if nothing else works the report is downloaded so the data isn't lost.
 */
async function shareForAnalysis(
  markdown: string,
  filename: string,
  title: string,
): Promise<AnalyzeResult> {
  const nav = shareNav();
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title, text: markdown });
      void copyText(markdown); // best-effort backstop; ignore if the gesture is spent
      return "shared";
    } catch (err) {
      // A dismissed share sheet is a completed interaction, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
      // Any other error: fall through to the clipboard path.
    }
  }

  const copied = await copyText(markdown);
  if (copied) {
    const opened = window.open(CLAUDE_NEW_CHAT_URL, "_blank", "noopener");
    return opened ? "copied-opened" : "copied";
  }
  downloadBlob(new Blob([markdown], { type: "text/markdown" }), filename);
  return "downloaded";
}

/** Share/copy every logged session as a Markdown report for agent analysis. */
export function analyzeSessionsInClaude(sessions: TrainingSession[]): Promise<AnalyzeResult> {
  return shareForAnalysis(sessionsToMarkdown(sessions), sessionsFilename("md"), "Training log");
}

/** Share/copy one session as a Markdown report for agent analysis. */
export function analyzeSessionInClaude(session: TrainingSession): Promise<AnalyzeResult> {
  return shareForAnalysis(
    sessionsToMarkdown([session]),
    `${sessionSlug(session)}.md`,
    session.name || "Session recap",
  );
}

export type CopyResult = "copied" | "downloaded";

/** Copy a Markdown report to the clipboard so it can be pasted into any AI; download as a backstop. */
async function copyForAnalysis(markdown: string, filename: string): Promise<CopyResult> {
  if (await copyText(markdown)) return "copied";
  downloadBlob(new Blob([markdown], { type: "text/markdown" }), filename);
  return "downloaded";
}

/** Copy every logged session as a Markdown analysis prompt for any AI. */
export function copySessionsPrompt(sessions: TrainingSession[]): Promise<CopyResult> {
  return copyForAnalysis(sessionsToMarkdown(sessions), sessionsFilename("md"));
}

/** Copy one session as a Markdown analysis prompt for any AI. */
export function copySessionPrompt(session: TrainingSession): Promise<CopyResult> {
  return copyForAnalysis(sessionsToMarkdown([session]), `${sessionSlug(session)}.md`);
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
