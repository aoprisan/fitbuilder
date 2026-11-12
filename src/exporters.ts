import { track } from "./analytics";
import { BODY_METRIC_LABELS, type BodyMetric } from "./bodyMap";
import { renderBodyMapToCanvas } from "./bodyMapRender";
import { copyText } from "./clipboard";
import { hasNativeShare, nativeShare } from "./nativeShare";
import { dataUrlToBytes, jpegsToPdf } from "./pdf";
import {
  hasFoodLog,
  hasWaterLog,
  renderFuelDayToCanvas,
  renderFuelHistoryToCanvas,
  renderTrainingHistoryToCanvas,
  renderWaterDayToCanvas,
  renderWaterHistoryToCanvas,
} from "./reportRender";
import { renderSessionToCanvas } from "./sessionRender";
import type { TrainingSession } from "./types";
import { sessionsToJson, sessionsToMarkdown as trainingMarkdown, sessionsToXml, slug } from "./util";
import { healthContextMarkdown } from "./health/crossData";

/** The training report, plus the water / food logged on those days when there is any. */
function sessionsToMarkdown(sessions: TrainingSession[]): string {
  const health = healthContextMarkdown(sessions);
  return health ? `${trainingMarkdown(sessions)}\n\n---\n\n${health}` : trainingMarkdown(sessions);
}

// Web Share API (Level 2, with files) isn't in every lib.dom version; describe
// just what we use so the code type-checks and degrades gracefully.
interface ShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string; url?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

function shareNav(): ShareCapableNavigator {
  return navigator as unknown as ShareCapableNavigator;
}

/** True when the platform can share files (i.e. the phone share sheet is available). */
export function canShareFiles(): boolean {
  if (hasNativeShare()) return true;
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

/** One PDF, a page per canvas (each page the size of its canvas). */
function pdfBlobFromCanvases(canvases: readonly HTMLCanvasElement[]): Blob {
  const bytes = jpegsToPdf(
    canvases.map((c) => ({
      jpeg: dataUrlToBytes(c.toDataURL("image/jpeg", 0.92)),
      width: c.width,
      height: c.height,
    })),
  );
  // Copy into a fresh ArrayBuffer so the Blob part is a plain ArrayBuffer.
  return new Blob([bytes.slice()], { type: "application/pdf" });
}

function pdfBlobFromCanvas(canvas: HTMLCanvasElement): Blob {
  return pdfBlobFromCanvases([canvas]);
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
  track("claude_analyze", { scope: "all" });
  return shareForAnalysis(sessionsToMarkdown(sessions), sessionsFilename("md"), "Training log");
}

/** Share/copy one session as a Markdown report for agent analysis. */
export function analyzeSessionInClaude(session: TrainingSession): Promise<AnalyzeResult> {
  track("claude_analyze", { scope: "one" });
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
  track("export", { format: "png" });
}

/** Download a rendered canvas as a (JPEG-in-)PDF. */
function downloadCanvasPdf(canvas: HTMLCanvasElement, filename: string): void {
  downloadBlob(pdfBlobFromCanvas(canvas), filename);
  track("export", { format: "pdf" });
}

export type ShareResult = "shared" | "downloaded";
export type ShareFormat = "png" | "pdf";

/**
 * Hand a file to the OS share sheet, where the person picks WhatsApp or any
 * other app: the native sheet inside the Capacitor app (its WebView has no
 * `navigator.share`), the Web Share API in a browser. Falls back to a download
 * when the platform can't share files. A user-cancelled share counts as "shared".
 */
async function shareBlob(blob: Blob, filename: string, title: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type });
  track("share", { format: blob.type === "application/pdf" ? "pdf" : "image" });

  if (hasNativeShare()) {
    await nativeShare({ text: title, file, keepName: true });
    return "shared";
  }

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

/** Share a rendered page as a PNG or a one-page PDF (`slug` is the filename without extension). */
async function shareCanvas(
  canvas: HTMLCanvasElement,
  slugName: string,
  title: string,
  format: ShareFormat = "png",
): Promise<ShareResult> {
  const blob = format === "pdf" ? pdfBlobFromCanvas(canvas) : await canvasToBlob(canvas, "image/png");
  return shareBlob(blob, `${slugName}.${format}`, title);
}

const stamp = (): string => new Date().toISOString().slice(0, 10);

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

/** Share a live-session recap as a PNG or PDF (share sheet, download fallback). */
export async function shareSession(
  session: TrainingSession,
  allSessions: TrainingSession[],
  format: ShareFormat = "png",
): Promise<ShareResult> {
  return shareCanvas(
    await renderSessionToCanvas(session, allSessions),
    sessionSlug(session),
    session.name || "Session recap",
    format,
  );
}

/** Date-stamped filename for a body map, e.g. "gym-body-map-fatigue-2026-05-22". */
function bodyMapSlug(metric: BodyMetric): string {
  return `gym-body-map-${metric}-${new Date().toISOString().slice(0, 10)}`;
}

/** Render the body map (front/back/side figures) for a metric and download it as a PNG. */
export async function exportBodyMapPng(metric: BodyMetric, sessions: TrainingSession[]): Promise<void> {
  await downloadCanvasPng(await renderBodyMapToCanvas(metric, sessions), `${bodyMapSlug(metric)}.png`);
}

/** Render the body map and download it as a PDF. */
export async function exportBodyMapPdf(metric: BodyMetric, sessions: TrainingSession[]): Promise<void> {
  downloadCanvasPdf(await renderBodyMapToCanvas(metric, sessions), `${bodyMapSlug(metric)}.pdf`);
}

/** Share the body map as a PNG or PDF (share sheet, download fallback). */
export async function shareBodyMap(
  metric: BodyMetric,
  sessions: TrainingSession[],
  format: ShareFormat = "png",
): Promise<ShareResult> {
  return shareCanvas(
    await renderBodyMapToCanvas(metric, sessions),
    bodyMapSlug(metric),
    `Body map — ${BODY_METRIC_LABELS[metric]}`,
    format,
  );
}

/** Share the whole training history (totals, weekly volume, session ledger). */
export async function shareTrainingHistory(sessions: TrainingSession[], format: ShareFormat): Promise<ShareResult> {
  return shareCanvas(
    await renderTrainingHistoryToCanvas(sessions),
    `gym-log-training-history-${stamp()}`,
    "Training history",
    format,
  );
}

/** Share one day of water (`date` "YYYY-MM-DD", default today). */
export async function shareWaterDay(format: ShareFormat, date?: string): Promise<ShareResult> {
  return shareCanvas(await renderWaterDayToCanvas(date), `gym-log-water-${date ?? stamp()}`, "Water", format);
}

/** Share the water trend over the last `days` days. */
export async function shareWaterHistory(days: number, format: ShareFormat): Promise<ShareResult> {
  return shareCanvas(
    await renderWaterHistoryToCanvas(days),
    `gym-log-water-history-${stamp()}`,
    "Water history",
    format,
  );
}

/** Share one day of food (`day` "YYYY-MM-DD"). */
export async function shareFuelDay(day: string, format: ShareFormat): Promise<ShareResult> {
  return shareCanvas(await renderFuelDayToCanvas(day), `gym-log-food-${day}`, "Food", format);
}

/** Share the food history over the last `days` days. */
export async function shareFuelHistory(days: number, format: ShareFormat): Promise<ShareResult> {
  return shareCanvas(
    await renderFuelHistoryToCanvas(days),
    `gym-log-food-history-${stamp()}`,
    "Food history",
    format,
  );
}

/** Days of water / food history the full report carries. */
const REPORT_DAYS = 30;

/**
 * Everything in one PDF, a page each: the body figure, the training history,
 * the latest session, then today's water and food with their 30-day histories.
 * Logs with nothing in them are left out.
 */
export async function shareFullReport(metric: BodyMetric, sessions: TrainingSession[]): Promise<ShareResult> {
  const pages: HTMLCanvasElement[] = [await renderBodyMapToCanvas(metric, sessions)];
  const logged = sessions.filter((s) => s.exercises.some((ex) => ex.sets.length > 0));
  if (logged.length) {
    pages.push(await renderTrainingHistoryToCanvas(sessions));
    const latest = logged.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
    pages.push(await renderSessionToCanvas(latest, sessions));
  }
  if (hasWaterLog()) {
    pages.push(await renderWaterDayToCanvas(), await renderWaterHistoryToCanvas(REPORT_DAYS));
  }
  if (hasFoodLog()) {
    pages.push(await renderFuelDayToCanvas(), await renderFuelHistoryToCanvas(REPORT_DAYS));
  }
  track("share", { format: "full-report" });
  return shareBlob(pdfBlobFromCanvases(pages), `gym-log-report-${stamp()}.pdf`, "Gym Log report");
}
