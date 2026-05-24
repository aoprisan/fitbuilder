import { loadLogoImage } from "./logo";

/* Shared Canvas 2D primitives and the "Training Ledger" visual language used by
   every exportable render — the routine sheet, the live-session recap, and the
   stats report. Keeping the palette, fonts, and common building blocks here
   means all three exports look like pages from the same letterpress ledger and
   the PNG/PDF pipeline stays dependency free. */

export const C = {
  bg: "#efe7d4",
  panel: "#e7dcc0",
  rowAlt: "rgba(27,22,16,0.045)",
  track: "rgba(27,22,16,0.10)",
  ink: "#1b1610",
  inkSoft: "rgba(27,22,16,0.64)",
  inkFaint: "rgba(27,22,16,0.42)",
  line: "rgba(27,22,16,0.18)",
  lineStrong: "rgba(27,22,16,0.36)",
  signal: "#d6422b",
  brick: "#6e1f1a",
  mustard: "#c9962a",
  navy: "#2c3e57",
  pine: "#3a5a40",
  onInk: "#efe7d4",
  chipBg: "rgba(201,150,42,0.12)",
} as const;

export const DISPLAY = "'Alfa Slab One', Rockwell, Georgia, serif";
export const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

// Logical layout units (multiplied by SCALE for the actual bitmap). Shared so
// every export is the same width and renders at the same crispness.
export const W = 760;
export const SCALE = 2;
export const PAD = 36;
/** Content width inside the page margins. */
export const CW = W - PAD * 2;

// Brand-logo banner: drawn top-left in the header, capped to these logical
// bounds (aspect ratio preserved). Replaces the eyebrow when present.
const LOGO_MAX_H = 60;
const LOGO_MAX_W = 320;

export type Ctx = CanvasRenderingContext2D;

/** A resolved logo plus the display size it should occupy in a header banner. */
export interface LogoFit {
  img: HTMLImageElement;
  w: number;
  h: number;
}

/** Load the global brand logo (if any) and fit it within the banner bounds. */
export async function resolveLogo(): Promise<LogoFit | null> {
  const img = await loadLogoImage();
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;
  const ar = img.naturalWidth / img.naturalHeight;
  let h = LOGO_MAX_H;
  let w = h * ar;
  if (w > LOGO_MAX_W) {
    w = LOGO_MAX_W;
    h = w / ar;
  }
  return { img, w, h };
}

/** Ensure the web fonts are rasterizable before we draw, so canvas text isn't
    silently rendered in a fallback face. Falls back gracefully on failure. */
export async function ensureFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  try {
    await Promise.all([
      fonts.load(`400 40px ${DISPLAY}`),
      fonts.load(`400 26px ${DISPLAY}`),
      fonts.load(`700 12px ${MONO}`),
      fonts.load(`600 15px ${MONO}`),
      fonts.load(`400 14px ${MONO}`),
    ]);
    await fonts.ready;
  } catch {
    // Best effort — proceed with whatever is available.
  }
}

/** Wrap `text` to `maxW`, breaking over-long unbroken tokens (e.g. rep
    pyramids) character-by-character so nothing overflows the column. */
export function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [""];
  const lines: string[] = [];
  let line = "";

  for (const token of tokens) {
    let tok = token;
    // Hard-break a single token wider than the column.
    while (ctx.measureText(tok).width > maxW && tok.length > 1) {
      let lo = 1;
      let hi = tok.length;
      let fit = 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (ctx.measureText(tok.slice(0, mid)).width <= maxW) {
          fit = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(tok.slice(0, fit));
      tok = tok.slice(fit);
    }
    const trial = line ? `${line} ${tok}` : tok;
    if (ctx.measureText(trial).width <= maxW) {
      line = trial;
    } else {
      if (line) lines.push(line);
      line = tok;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A pill progress bar: faint track with a coloured fill clamped to [0, 1]. */
export function drawBar(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  fill: string,
): void {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = C.track;
  ctx.fill();
  const fw = Math.max(0, Math.min(1, ratio)) * w;
  if (fw > 0) {
    roundRect(ctx, x, y, fw, h, h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

/** Printer's crop/registration marks at the four trim corners of the page. */
export function drawCropMarks(ctx: Ctx, w: number, h: number): void {
  const m = 15;
  const len = 13;
  ctx.strokeStyle = C.inkFaint;
  ctx.lineWidth = 1;
  const corner = (cx: number, cy: number, sx: number, sy: number): void => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + sx * len, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + sy * len);
    ctx.stroke();
  };
  corner(m, m, 1, 1);
  corner(w - m, m, -1, 1);
  corner(m, h - m, 1, -1);
  corner(w - m, h - m, -1, -1);
}

/** The shared page header: a brand-logo banner (or text eyebrow), the document
    title, and the signal-red baseline rule. Returns the y below the rule. */
export function drawHeader(
  ctx: Ctx,
  opts: { eyebrow: string; title: string; logo: LogoFit | null; paint: boolean },
): number {
  const { eyebrow, title, logo, paint } = opts;
  let y = PAD;
  ctx.textBaseline = "top";

  if (logo) {
    if (paint) ctx.drawImage(logo.img, PAD, y, logo.w, logo.h);
    y += logo.h + 14;
  } else {
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText(eyebrow, PAD, y);
    }
    y += 22;
  }

  ctx.font = `400 40px ${DISPLAY}`;
  for (const ln of wrap(ctx, title.trim() || "Untitled", CW)) {
    if (paint) {
      ctx.fillStyle = C.ink;
      ctx.fillText(ln.toUpperCase(), PAD, y);
    }
    y += 42;
  }
  y += 4;

  if (paint) {
    ctx.fillStyle = C.signal;
    ctx.fillRect(PAD, y, 120, 6);
  }
  return y + 16;
}

/** The shared page footer: a hairline rule above a small mono caption. */
export function drawFooter(ctx: Ctx, y: number, label: string, paint: boolean): number {
  let cy = y + 12;
  if (paint) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, cy + 0.5);
    ctx.lineTo(PAD + CW, cy + 0.5);
    ctx.stroke();
  }
  cy += 12;
  ctx.font = `700 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(label, PAD, cy);
  }
  cy += 22;
  return cy + PAD;
}

/** One muscle row in a summary block: name, right-aligned detail, share bar. */
export interface SummaryMuscle {
  name: string;
  detail: string;
  /** Bar fill, 0–1 (e.g. this muscle's effort as a share of the busiest). */
  ratio: number;
}

/** Normalised data for the effort/recovery card shared by the session recap
    (one session) and the stats report (lifetime, pooled across sessions). */
export interface SummaryBlock {
  eyebrow: string;
  /** Headline badge, e.g. the effort tier ("Hard") or total points ("182 pts"). */
  badge: string;
  meta: string;
  /** Effort-gauge fill, 0–1, or null to omit the headline bar (lifetime view). */
  bar: number | null;
  musclesLabel: string;
  muscles: SummaryMuscle[];
  hydration: string;
  hydrationNote: string;
  protein: string;
  /** Rough energy burned, e.g. "≈ 310 kcal". */
  calories: string;
}

function drawKV(
  ctx: Ctx,
  x: number,
  w: number,
  y: number,
  label: string,
  value: string,
  paint: boolean,
): number {
  ctx.font = `400 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkSoft;
    ctx.fillText(label, x, y);
  }
  ctx.font = `700 13px ${MONO}`;
  if (paint) {
    ctx.textAlign = "right";
    ctx.fillStyle = C.ink;
    ctx.fillText(value, x + w, y - 1);
    ctx.textAlign = "left";
  }
  return y + 22;
}

/** Lay out (and optionally paint) the summary card's contents, returning the y
    below it. Kept separate from the panel so the panel can be sized to fit. */
function layoutSummary(ctx: Ctx, x: number, y: number, w: number, b: SummaryBlock, paint: boolean): number {
  const PP = 18;
  const ix = x + PP;
  const iw = w - PP * 2;
  let cy = y + PP;

  ctx.font = `700 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.brick;
    ctx.fillText(b.eyebrow.toUpperCase(), ix, cy);
  }
  ctx.font = `700 13px ${MONO}`;
  if (paint) {
    ctx.textAlign = "right";
    ctx.fillStyle = C.ink;
    ctx.fillText(b.badge.toUpperCase(), ix + iw, cy - 1);
    ctx.textAlign = "left";
  }
  cy += 22;

  if (b.bar !== null) {
    if (paint) drawBar(ctx, ix, cy, iw, 10, b.bar, C.signal);
    cy += 18;
  }

  ctx.font = `400 12px ${MONO}`;
  for (const ln of wrap(ctx, b.meta, iw)) {
    if (paint) {
      ctx.fillStyle = C.inkSoft;
      ctx.fillText(ln, ix, cy);
    }
    cy += 17;
  }
  cy += 8;

  ctx.font = `700 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(b.musclesLabel.toUpperCase(), ix, cy);
  }
  cy += 18;

  for (const m of b.muscles) {
    ctx.font = `600 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.ink;
      ctx.fillText(m.name, ix, cy);
    }
    ctx.font = `400 11px ${MONO}`;
    if (paint) {
      ctx.textAlign = "right";
      ctx.fillStyle = C.inkSoft;
      ctx.fillText(m.detail, ix + iw, cy + 1);
      ctx.textAlign = "left";
    }
    cy += 16;
    if (paint) drawBar(ctx, ix, cy, iw, 6, m.ratio, C.mustard);
    cy += 14;
  }
  cy += 6;

  cy = drawKV(ctx, ix, iw, cy, "Hydration", b.hydration, paint);
  ctx.font = `400 11px ${MONO}`;
  for (const ln of wrap(ctx, b.hydrationNote, iw)) {
    if (paint) {
      ctx.fillStyle = C.inkFaint;
      ctx.fillText(ln, ix, cy);
    }
    cy += 16;
  }
  cy += 6;

  cy = drawKV(ctx, ix, iw, cy, "Protein to recover", b.protein, paint);
  cy = drawKV(ctx, ix, iw, cy, "Energy burned", b.calories, paint);

  return cy + PP;
}

/** Draw the effort/recovery summary card (panel + contents). Returns the y
    below it; measures itself first so the panel fits the content exactly. */
export function drawSummaryBlock(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  b: SummaryBlock,
  paint: boolean,
): number {
  const bottom = layoutSummary(ctx, x, y, w, b, false);
  if (paint) {
    roundRect(ctx, x, y, w, bottom - y, 8);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    layoutSummary(ctx, x, y, w, b, true);
  }
  return bottom;
}

/** Create a high-DPI canvas, run the supplied two-pass renderer (measure then
    paint) at the shared width, stamp crop marks, and return the canvas. */
export function paintPage(draw: (ctx: Ctx, paint: boolean) => number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // Pass 1: measure (text metrics don't depend on bitmap size).
  const totalH = draw(ctx, false);

  // Resizing the canvas resets the context, so configure and paint afterwards.
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(totalH * SCALE);
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, totalH);
  ctx.textAlign = "left";
  draw(ctx, true);
  drawCropMarks(ctx, W, totalH);
  return canvas;
}
