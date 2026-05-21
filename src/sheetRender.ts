import { loadLogoImage } from "./logo";
import { loadTrainer } from "./trainer";
import type { Routine, RoutineSheet } from "./types";

/* Renders a routine sheet onto a <canvas> using the Canvas 2D API directly —
   no DOM rasterization library, so the output is deterministic and dependency
   free. The same canvas backs both the PNG and the (JPEG-in-)PDF export.
   Colors and fonts mirror the "Training Ledger" theme in styles.css — a
   letterpress workout sheet printed on cream stock. */

const C = {
  bg: "#efe7d4",
  panel: "#e7dcc0",
  rowAlt: "rgba(27,22,16,0.045)",
  ink: "#1b1610",
  inkSoft: "rgba(27,22,16,0.64)",
  inkFaint: "rgba(27,22,16,0.42)",
  line: "rgba(27,22,16,0.18)",
  lineStrong: "rgba(27,22,16,0.36)",
  signal: "#d6422b",
  brick: "#6e1f1a",
  mustard: "#c9962a",
  onInk: "#efe7d4",
  chipBg: "rgba(201,150,42,0.12)",
} as const;

const DISPLAY = "'Alfa Slab One', Rockwell, Georgia, serif";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

// Logical layout units (multiplied by SCALE for the actual bitmap).
const W = 760;
const SCALE = 2;
const PAD = 36;
const CW = W - PAD * 2;

const BADGE = 24;
const COL_GAP = 18;
const ROW_PAD_V = 11;
const NAME_SIZE = 15;
const NAME_LH = 21;
const PRES_SIZE = 14;
const PRES_LH = 20;

const contentX = PAD + BADGE + 14;
const contentW = CW - BADGE - 14;
const nameColW = (contentW - COL_GAP) * 0.54;
const presColW = (contentW - COL_GAP) * 0.46;
const presX = contentX + nameColW + COL_GAP;

// Brand-logo banner: drawn top-left in the header, capped to these logical
// bounds (aspect ratio preserved). Replaces the "GYM LOG" eyebrow when present.
const LOGO_MAX_H = 60;
const LOGO_MAX_W = 320;

type Ctx = CanvasRenderingContext2D;

/** A resolved logo plus the display size it should occupy on the sheet. */
interface SheetLogo {
  img: HTMLImageElement;
  w: number;
  h: number;
}

/** Load the global brand logo (if any) and fit it within the banner bounds. */
async function resolveLogo(): Promise<SheetLogo | null> {
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
async function ensureFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  try {
    await Promise.all([
      fonts.load(`400 40px ${DISPLAY}`),
      fonts.load(`400 26px ${DISPLAY}`),
      fonts.load(`700 12px ${MONO}`),
      fonts.load(`600 ${NAME_SIZE}px ${MONO}`),
      fonts.load(`400 ${PRES_SIZE}px ${MONO}`),
    ]);
    await fonts.ready;
  } catch {
    // Best effort — proceed with whatever is available.
  }
}

/** Wrap `text` to `maxW`, breaking over-long unbroken tokens (e.g. rep
    pyramids) character-by-character so nothing overflows the column. */
function wrap(ctx: Ctx, text: string, maxW: number): string[] {
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

/** Printer's crop/registration marks at the four trim corners of the sheet. */
function drawCropMarks(ctx: Ctx, w: number, h: number): void {
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

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawTags(ctx: Ctx, tags: string[], top: number, paint: boolean): number {
  if (tags.length === 0) return top;
  const chipH = 24;
  const chipGap = 8;
  const padX = 11;
  let x = PAD;
  let y = top;
  ctx.font = `700 11px ${MONO}`;

  for (const tag of tags) {
    const label = tag.toUpperCase();
    const w = ctx.measureText(label).width + padX * 2;
    if (x > PAD && x + w > PAD + CW) {
      x = PAD;
      y += chipH + chipGap;
    }
    if (paint) {
      roundRect(ctx, x, y, w, chipH, 3);
      ctx.fillStyle = C.chipBg;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = C.mustard;
      ctx.stroke();
      ctx.fillStyle = C.brick;
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + padX, y + chipH / 2 + 0.5);
    }
    x += w + chipGap;
  }
  return y + chipH;
}

function drawRoutine(ctx: Ctx, routine: Routine, top: number, paint: boolean): number {
  let y = top;

  // Title.
  ctx.font = `400 26px ${DISPLAY}`;
  ctx.textBaseline = "top";
  const titleLines = wrap(ctx, routine.title.trim() || "Untitled routine", CW);
  for (const ln of titleLines) {
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText(ln.toUpperCase(), PAD, y);
    }
    y += 30;
  }
  y += 6;

  // Tag chips.
  y = drawTags(ctx, routine.tags, y, paint);
  y += 14;

  // Separator above the exercise table.
  if (paint) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(PAD + CW, y + 0.5);
    ctx.stroke();
  }
  y += 10;

  // Exercise rows.
  routine.exercises.forEach((exercise, i) => {
    const name = exercise.name.trim() || "—";
    const pres = exercise.prescription.trim();

    ctx.font = `600 ${NAME_SIZE}px ${MONO}`;
    const nameLines = wrap(ctx, name, nameColW);
    ctx.font = `400 ${PRES_SIZE}px ${MONO}`;
    const presLines = pres ? wrap(ctx, pres, presColW) : [];

    const bodyH = Math.max(nameLines.length * NAME_LH, presLines.length * PRES_LH, NAME_LH);
    const rowH = bodyH + ROW_PAD_V * 2;

    if (paint) {
      if (i % 2 === 1) {
        ctx.fillStyle = C.rowAlt;
        ctx.fillRect(PAD, y, CW, rowH);
      }

      // Index badge.
      roundRect(ctx, PAD, y + ROW_PAD_V, BADGE, BADGE, 3);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.fillStyle = C.onInk;
      ctx.font = `700 12px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), PAD + BADGE / 2, y + ROW_PAD_V + BADGE / 2 + 0.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // Exercise name.
      ctx.fillStyle = C.ink;
      ctx.font = `600 ${NAME_SIZE}px ${MONO}`;
      nameLines.forEach((ln, li) => ctx.fillText(ln, contentX, y + ROW_PAD_V + li * NAME_LH));

      // Prescription.
      ctx.fillStyle = C.brick;
      ctx.font = `400 ${PRES_SIZE}px ${MONO}`;
      presLines.forEach((ln, li) => ctx.fillText(ln, presX, y + ROW_PAD_V + li * PRES_LH));

      // Ledger baseline beneath each row.
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y + rowH - 0.5);
      ctx.lineTo(PAD + CW, y + rowH - 0.5);
      ctx.stroke();
    }

    y += rowH;
  });

  return y;
}

/** Lay out (and optionally paint) the whole sheet; returns total logical height. */
function drawSheet(
  ctx: Ctx,
  sheet: RoutineSheet,
  paint: boolean,
  logo: SheetLogo | null,
  trainer: string,
): number {
  let y = PAD;
  // Everything below positions text from its top edge.
  ctx.textBaseline = "top";

  if (logo) {
    // Brand banner stands in for the eyebrow.
    if (paint) ctx.drawImage(logo.img, PAD, y, logo.w, logo.h);
    y += logo.h + 14;
  } else {
    // Eyebrow.
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText("GYM LOG · TRAINING LEDGER", PAD, y);
    }
    y += 22;
  }

  // Document title.
  ctx.font = `400 40px ${DISPLAY}`;
  const nameLines = wrap(ctx, sheet.name.trim() || "Untitled sheet", CW);
  for (const ln of nameLines) {
    if (paint) {
      ctx.fillStyle = C.ink;
      ctx.fillText(ln.toUpperCase(), PAD, y);
    }
    y += 42;
  }
  y += 4;

  // Signal-red baseline rule.
  if (paint) {
    ctx.fillStyle = C.signal;
    ctx.fillRect(PAD, y, 120, 6);
  }
  y += 16;

  // Trainer byline.
  if (trainer) {
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText(`TRAINER · ${trainer.toUpperCase()}`, PAD, y);
    }
    y += 20;
  }

  // Generated date.
  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  ctx.font = `400 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(`Generated ${date}`, PAD, y);
  }
  y += 28;

  // Routines.
  sheet.routines.forEach((routine, i) => {
    if (i > 0) {
      if (paint) {
        ctx.strokeStyle = C.lineStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, y + 0.5);
        ctx.lineTo(PAD + CW, y + 0.5);
        ctx.stroke();
      }
      y += 30;
    }
    y = drawRoutine(ctx, routine, y, paint);
  });

  y += 24;

  // Footer.
  if (paint) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(PAD + CW, y + 0.5);
    ctx.stroke();
  }
  y += 12;
  ctx.font = `700 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    ctx.fillText("GYM LOG — ROUTINE SHEET", PAD, y);
  }
  y += 22;

  return y + PAD;
}

/** Render a sheet to a freshly created (high-DPI) canvas. */
export async function renderSheetToCanvas(sheet: RoutineSheet): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const logo = await resolveLogo();
  const trainer = loadTrainer();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  // Pass 1: measure (text metrics don't depend on bitmap size).
  const totalH = drawSheet(ctx, sheet, false, logo, trainer);

  // Resizing the canvas resets the context, so configure and paint afterwards.
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(totalH * SCALE);
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, totalH);
  ctx.textAlign = "left";
  drawSheet(ctx, sheet, true, logo, trainer);
  drawCropMarks(ctx, W, totalH);

  return canvas;
}
