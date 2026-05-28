import {
  C,
  CW,
  DISPLAY,
  ensureFonts,
  type LogoFit,
  MONO,
  PAD,
  paintPage,
  resolveLogo,
  roundRect,
  wrap,
  type Ctx,
} from "./canvasKit";
import { loadTrainer } from "./trainer";
import type { Routine, RoutineSheet } from "./types";
import { formatSetTargets } from "./util";

/* Renders a routine sheet onto a <canvas> using the Canvas 2D API directly —
   no DOM rasterization library, so the output is deterministic and dependency
   free. The same canvas backs both the PNG and the (JPEG-in-)PDF export.
   Shared palette, fonts, and primitives live in ./canvasKit so every export
   (sheet, session recap, stats report) reads like the same letterpress ledger. */

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
    // Structured per-set targets take precedence on shared exports; free-text
    // prescription is the fallback for imported / hand-written routines.
    const pres =
      exercise.setTargets && exercise.setTargets.length > 0
        ? formatSetTargets(exercise.setTargets)
        : (exercise.prescription ?? "").trim();

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
  logo: LogoFit | null,
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
  return paintPage((ctx, paint) => drawSheet(ctx, sheet, paint, logo, trainer));
}
