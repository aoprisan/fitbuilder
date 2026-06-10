import { sessionPlanPct, sessionsForSheet } from "./adherence";
import { sessionAdherence } from "./benchmark";
import {
  C,
  CW,
  drawBar,
  drawFooter,
  drawHeader,
  ensureFonts,
  type LogoFit,
  MONO,
  PAD,
  paintPage,
  resolveLogo,
  type Ctx,
  wrap,
} from "./canvasKit";
import { loadTrainer } from "./trainer";
import type { RoutineSheet, TrainingSession } from "./types";
import { formatSessionDate, sessionSetCount } from "./util";

/* Renders the trainer-side adherence report for one routine sheet: every run a
   student logged from it (Live "follow" sessions and Execute runs), each scored
   against the prescription — the coach's "did they actually do the plan?" page.
   Same "Training Ledger" language as the session recap; backs the Report
   share/PNG/PDF on the sheet library. */

const BAR_H = 10;
const BAR_W = 150;
const ROW_LH = 20;
const EX_LH = 17;
/** Newest runs first; the report stays one readable page. */
const MAX_RUNS = 10;

/** Colour for a completion percentage — green on plan, amber partial, red low. */
function pctColor(pct: number): string {
  if (pct >= 85) return C.pine;
  if (pct >= 50) return C.mustard;
  return C.signal;
}

function drawRun(ctx: Ctx, session: TrainingSession, top: number, paint: boolean): number {
  let y = top;
  const pct = sessionPlanPct(session);

  // Run headline: date + name on the left, the completion % + bar on the right.
  ctx.font = `600 14px ${MONO}`;
  const title = `${formatSessionDate(session.startedAt)} — ${session.name || "Session"}`;
  const titleLines = wrap(ctx, title, CW - BAR_W - 90);
  if (paint) {
    ctx.fillStyle = C.ink;
    titleLines.forEach((ln, i) => ctx.fillText(ln, PAD, y + i * ROW_LH));
    if (pct !== null) {
      drawBar(ctx, PAD + CW - BAR_W, y + 2, BAR_W, BAR_H, pct / 100, pctColor(pct));
      ctx.font = `700 13px ${MONO}`;
      ctx.fillStyle = pctColor(pct);
      ctx.textAlign = "right";
      ctx.fillText(`${pct}%`, PAD + CW - BAR_W - 10, y);
      ctx.textAlign = "left";
    } else {
      ctx.font = `400 12px ${MONO}`;
      ctx.fillStyle = C.inkSoft;
      ctx.textAlign = "right";
      ctx.fillText("no plan data", PAD + CW, y);
      ctx.textAlign = "left";
    }
  }
  y += titleLines.length * ROW_LH;

  ctx.font = `400 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(`${sessionSetCount(session)} sets logged`, PAD, y);
  }
  y += EX_LH;

  // Per-exercise prescribed-vs-done lines, from the structured benchmark when
  // the run carried one. Free-text-only runs just keep the headline percentage.
  const structured = sessionAdherence(session);
  if (structured) {
    for (const row of structured.rows) {
      const bm = row.benchmark;
      const stat =
        bm.targetLoadKg !== null
          ? `${bm.doneReps}/${bm.prescribedReps} reps · ${bm.loggedLoadKg ?? 0}/${bm.targetLoadKg} kg`
          : `${bm.doneReps}/${bm.prescribedReps} reps`;
      ctx.font = `400 12px ${MONO}`;
      const name = wrap(ctx, row.name, CW - 230)[0] ?? row.name;
      if (paint) {
        ctx.fillStyle = C.inkSoft;
        ctx.fillText(name, PAD + 14, y);
        ctx.fillStyle = bm.fraction >= 1 ? C.pine : C.brick;
        ctx.textAlign = "right";
        ctx.fillText(stat, PAD + CW, y);
        ctx.textAlign = "left";
      }
      y += EX_LH;
    }
  }

  y += 8;
  if (paint) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(PAD + CW, y + 0.5);
    ctx.stroke();
  }
  return y + 14;
}

function drawReport(
  ctx: Ctx,
  sheet: RoutineSheet,
  runs: TrainingSession[],
  logo: LogoFit | null,
  trainer: string,
  paint: boolean,
): number {
  let y = drawHeader(ctx, {
    eyebrow: "GYM LOG · ADHERENCE REPORT",
    title: sheet.name || "Routine",
    logo,
    paint,
  });

  if (trainer) {
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText(`TRAINER · ${trainer.toUpperCase()}`, PAD, y);
    }
    y += 20;
  }

  const pcts = runs
    .map((s) => sessionPlanPct(s))
    .filter((p): p is number => p !== null);
  const avg = pcts.length > 0 ? Math.round(pcts.reduce((a, p) => a + p, 0) / pcts.length) : null;
  const shown = runs.slice(0, MAX_RUNS);
  const oldest = runs[runs.length - 1];
  const newest = runs[0];

  ctx.font = `700 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    const range =
      oldest && newest && oldest !== newest
        ? ` · ${formatSessionDate(oldest.startedAt)} → ${formatSessionDate(newest.startedAt)}`
        : "";
    ctx.fillText(`${runs.length} RUN${runs.length === 1 ? "" : "S"}${range}`.toUpperCase(), PAD, y);
  }
  y += 24;

  if (avg !== null) {
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.ink;
      ctx.fillText("AVERAGE ADHERENCE", PAD, y);
      ctx.fillStyle = pctColor(avg);
      ctx.textAlign = "right";
      ctx.fillText(`${avg}%`, PAD + CW, y);
      ctx.textAlign = "left";
    }
    y += 18;
    if (paint) drawBar(ctx, PAD, y, CW, 12, avg / 100, pctColor(avg));
    y += 30;
  }

  ctx.font = `700 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.brick;
    ctx.fillText(
      `RUNS${runs.length > shown.length ? ` — LATEST ${shown.length} OF ${runs.length}` : ""}`,
      PAD,
      y,
    );
  }
  y += 22;
  if (paint) {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(PAD + CW, y + 0.5);
    ctx.stroke();
  }
  y += 14;

  for (const s of shown) y = drawRun(ctx, s, y, paint);
  y += 10;

  return drawFooter(ctx, y, "GYM LOG — ADHERENCE REPORT", paint);
}

/** Render the adherence report for a sheet to a freshly created (high-DPI) canvas. */
export async function renderAdherenceToCanvas(
  sheet: RoutineSheet,
  allSessions: TrainingSession[],
): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const logo = await resolveLogo();
  const trainer = loadTrainer();
  const runs = sessionsForSheet(sheet.id, allSessions);
  return paintPage((ctx, paint) => drawReport(ctx, sheet, runs, logo, trainer, paint));
}
