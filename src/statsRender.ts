import {
  C,
  CW,
  DISPLAY,
  drawFooter,
  drawHeader,
  drawSummaryBlock,
  ensureFonts,
  type LogoFit,
  MONO,
  PAD,
  paintPage,
  roundRect,
  resolveLogo,
  type SummaryBlock,
  type Ctx,
  wrap,
} from "./canvasKit";
import { lifetimeEffort, type LifetimeEffort } from "./effort";
import { loadOneRmMaxes } from "./oneRmStore";
import { loadTrainer } from "./trainer";
import {
  bestOneRm,
  type BestOneRm,
  buildProgress,
  exerciseKeyLabel,
  type ProgressFilter,
  type ProgressPoint,
} from "./stats";
import { MUSCLE_LABELS, type TrainingSession } from "./types";
import { formatClock, round2 } from "./util";

/* Renders the Stats screen as a one-page report: lifetime effort/recovery, the
   best one-rep max, and a stacked column of progress charts drawn straight onto
   the canvas (mirroring the on-screen SVG line charts). Backs the stats PNG/PDF
   export and the native share sheet. */

const CHART_H = 150;
const CHART_GAP = 16;

interface ChartSpec {
  title: string;
  unit: string;
  values: number[];
  labels: string[];
  color: string;
  format: (n: number) => string;
}

/** The lifetime effort/recovery card pooled across every logged session. */
function buildLifetimeSummary(lifetime: LifetimeEffort): SummaryBlock | null {
  if (lifetime.sessions === 0) return null;

  const byEffort = [...lifetime.muscles].sort((a, b) => b.effort - a.effort);
  const topEffort = byEffort[0]?.effort ?? 0;
  const liters = Math.round(lifetime.hydrationMl / 100) / 10;
  const glassCount = Math.round(lifetime.hydrationMl / 250);
  const sessionWord = lifetime.sessions === 1 ? "session" : "sessions";
  const muscleWord = lifetime.muscles.length === 1 ? "muscle group" : "muscle groups";

  return {
    eyebrow: "Lifetime effort",
    badge: `${lifetime.points} pts`,
    meta: `Across ${lifetime.sessions} ${sessionWord} · ${lifetime.muscles.length} ${muscleWord}`,
    bar: null,
    musclesLabel: "Effort per muscle",
    muscles: byEffort.map((m) => ({
      name: MUSCLE_LABELS[m.muscle],
      detail: `${m.volume > 0 ? `${m.volume} kg` : "Bodyweight"} · ${formatClock(m.timeSec)} · ${m.sets} ${m.sets === 1 ? "set" : "sets"}`,
      ratio: topEffort > 0 ? m.effort / topEffort : 0,
    })),
    hydration: `≈ ${liters.toFixed(1)} L · ${glassCount} ${glassCount === 1 ? "glass" : "glasses"}`,
    hydrationNote: "Total fluid to match every session's effort.",
    protein: `≈ ${lifetime.proteinG} g`,
    calories: `≈ ${lifetime.caloriesKcal} kcal`,
  };
}

/** The best logged + estimated one-rep max, in a bordered two-cell panel. */
function drawOneRm(ctx: Ctx, y: number, best: BestOneRm, paint: boolean): number {
  const h = 84;
  const fmt = (n: number): string => (n > 0 ? `${round2(n)} kg` : "—");

  if (paint) {
    roundRect(ctx, PAD, y, CW, h, 8);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textBaseline = "top";
    ctx.font = `700 11px ${MONO}`;
    ctx.fillStyle = C.brick;
    ctx.fillText("BEST ONE-REP MAX", PAD + 18, y + 16);

    const half = (CW - 36) / 2;
    const cell = (cx: number, label: string, value: number): void => {
      ctx.font = `400 11px ${MONO}`;
      ctx.fillStyle = C.inkFaint;
      ctx.fillText(label.toUpperCase(), cx, y + 40);
      ctx.font = `400 22px ${DISPLAY}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(fmt(value), cx, y + 54);
    };
    cell(PAD + 18, "Logged", best.logged);
    cell(PAD + 18 + half, "Estimated", best.estimated);
  }

  return y + h + 16;
}

function drawChart(ctx: Ctx, x: number, y: number, w: number, h: number, spec: ChartSpec): void {
  const P = 14;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.lineStrong;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const { values: vals, labels, unit, color, format: fmt } = spec;
  const n = vals.length;
  const last = vals[n - 1] ?? 0;
  const first = vals[0] ?? 0;
  const delta = round2(last - first);

  ctx.textBaseline = "top";
  ctx.font = `700 12px ${MONO}`;
  ctx.fillStyle = C.brick;
  ctx.fillText(spec.title.toUpperCase(), x + P, y + P);

  ctx.textAlign = "right";
  ctx.font = `700 14px ${MONO}`;
  ctx.fillStyle = C.ink;
  ctx.fillText(`${fmt(last)} ${unit}`.trim(), x + w - P, y + P - 1);

  const deltaText =
    n <= 1
      ? "first session"
      : delta > 0
        ? `▲ +${fmt(delta)} ${unit}`
        : delta < 0
          ? `▼ ${fmt(Math.abs(delta))} ${unit}`
          : "no change";
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = n <= 1 ? C.inkFaint : delta > 0 ? C.pine : delta < 0 ? C.signal : C.inkFaint;
  ctx.fillText(deltaText, x + w - P, y + P + 18);
  ctx.textAlign = "left";

  const plotTop = y + P + 34;
  const plotBottom = y + h - P - 16;
  const px = x + P;
  const pw = w - P * 2;
  const ph = plotBottom - plotTop;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const xAt = (i: number): number => (n <= 1 ? px + pw / 2 : px + (i / (n - 1)) * pw);
  const yAt = (v: number): number =>
    max === min ? plotTop + ph / 2 : plotTop + (1 - (v - min) / span) * ph;

  // Faint peak guide line + its value at the right end.
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(px, yAt(max));
  ctx.lineTo(px + pw, yAt(max));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = "right";
  ctx.font = `400 9px ${MONO}`;
  ctx.fillStyle = C.inkFaint;
  ctx.fillText(fmt(max), px + pw, Math.max(plotTop - 2, yAt(max) - 11));
  ctx.textAlign = "left";

  // Baseline.
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, plotBottom + 0.5);
  ctx.lineTo(px + pw, plotBottom + 0.5);
  ctx.stroke();

  const pts = vals.map((v, i) => [xAt(i), yAt(v)] as [number, number]);

  if (n > 1) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, plotBottom);
    for (const [cx, cy] of pts) ctx.lineTo(cx, cy);
    ctx.lineTo(px + pw, plotBottom);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy)));
    ctx.stroke();
  }

  pts.forEach(([cx, cy], i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, i === n - 1 ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  ctx.textBaseline = "alphabetic";
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = C.inkFaint;
  ctx.fillText(labels[0] ?? "", px, y + h - P + 4);
  if (n > 1) {
    ctx.textAlign = "right";
    ctx.fillText(labels[n - 1] ?? "", px + pw, y + h - P + 4);
    ctx.textAlign = "left";
  }
  ctx.textBaseline = "top";
}

function drawStats(
  ctx: Ctx,
  scope: string,
  range: string,
  summary: SummaryBlock | null,
  best: BestOneRm | null,
  charts: ChartSpec[],
  logo: LogoFit | null,
  trainer: string,
  paint: boolean,
): number {
  let y = drawHeader(ctx, { eyebrow: "GYM LOG · STATS REPORT", title: "Training Stats", logo, paint });

  if (trainer) {
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText(`TRAINER · ${trainer.toUpperCase()}`, PAD, y);
    }
    y += 20;
  }

  ctx.font = `700 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.brick;
    ctx.fillText(scope.toUpperCase(), PAD, y);
  }
  y += 18;

  ctx.font = `400 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkSoft;
    ctx.fillText(range, PAD, y);
  }
  y += 24;

  if (summary) {
    y = drawSummaryBlock(ctx, PAD, y, CW, summary, paint);
    y += 16;
  }

  if (best && (best.logged > 0 || best.estimated > 0)) {
    y = drawOneRm(ctx, y, best, paint);
  }

  if (charts.length > 0) {
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText("PROGRESS OVER TIME", PAD, y);
    }
    y += 22;
    for (const spec of charts) {
      if (paint) drawChart(ctx, PAD, y, CW, CHART_H, spec);
      y += CHART_H + CHART_GAP;
    }
  } else {
    ctx.font = `400 14px ${MONO}`;
    for (const ln of wrap(ctx, "No sets logged yet — run a live session to build your charts.", CW)) {
      if (paint) {
        ctx.fillStyle = C.inkSoft;
        ctx.fillText(ln, PAD, y);
      }
      y += 20;
    }
    y += 4;
  }

  return drawFooter(ctx, y, "GYM LOG — STATS REPORT", paint);
}

/** Render the stats report for the given scope to a high-DPI canvas. */
export async function renderStatsToCanvas(
  sessions: TrainingSession[],
  filter: ProgressFilter,
): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const logo = await resolveLogo();
  const trainer = loadTrainer();

  const summary = buildLifetimeSummary(lifetimeEffort(sessions));
  const points: ProgressPoint[] = buildProgress(sessions, filter);
  const best = points.length > 0 ? bestOneRm(sessions, filter, loadOneRmMaxes()) : null;
  const labels = points.map((p) => p.label);
  const scope = filter === "all" ? "All exercises" : exerciseKeyLabel(filter);
  const range =
    points.length === 0
      ? "No sessions logged yet"
      : points.length === 1
        ? `1 session · ${labels[0]}`
        : `${points.length} sessions · ${labels[0]} → ${labels[labels.length - 1]}`;

  const kg = (n: number): string => String(round2(n));
  const charts: ChartSpec[] =
    points.length === 0
      ? []
      : [
          { title: "Reps", unit: "reps", values: points.map((p) => p.reps), labels, color: C.signal, format: (n) => String(n) },
          { title: "Top weight", unit: "kg", values: points.map((p) => p.topWeight), labels, color: C.navy, format: kg },
          { title: "Volume", unit: "kg", values: points.map((p) => p.volume), labels, color: C.brick, format: kg },
          { title: "Strength", unit: "kg", values: points.map((p) => p.strength), labels, color: C.pine, format: kg },
          { title: "Hypertrophy", unit: "kg", values: points.map((p) => p.hypertrophy), labels, color: C.mustard, format: kg },
        ];

  return paintPage((ctx, paint) =>
    drawStats(ctx, scope, range, summary, best, charts, logo, trainer, paint),
  );
}
