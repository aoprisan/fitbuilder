import {
  C,
  CW,
  drawFooter,
  drawHeader,
  drawSummaryBlock,
  ensureFonts,
  type LogoFit,
  MONO,
  PAD,
  paintPage,
  resolveLogo,
  roundRect,
  type SummaryBlock,
  type Ctx,
  wrap,
} from "./canvasKit";
import {
  estimateCalories,
  estimateProteinG,
  muscleBreakdown,
  readEffort,
  readHydration,
} from "./effort";
import { epley1RM } from "./stats";
import { loadTrainer } from "./trainer";
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  type TrainingSession,
} from "./types";
import { formatClock, formatSessionDate, round2, sessionSetCount, sessionVolume } from "./util";

/* Renders a finished (or in-progress) live session as a one-page "recap" — the
   same effort/recovery card shown on screen plus a ledger of every exercise and
   its logged sets. Backs the session PNG/PDF export and the native share sheet. */

const BADGE = 24;
const COL_GAP = 18;
const contentX = PAD + BADGE + 14;
const contentW = CW - BADGE - 14;
const nameColW = (contentW - COL_GAP) * 0.5;
const setColW = (contentW - COL_GAP) * 0.5;
const setX = contentX + nameColW + COL_GAP;

const NAME_SIZE = 15;
const NAME_LH = 21;
const EYE_LH = 16;
const SET_SIZE = 14;
const SET_LH = 20;
const ROW_PAD_V = 11;

/** The effort/recovery card data for a single session (null until a set exists). */
function buildSessionSummary(
  session: TrainingSession,
  allSessions: TrainingSession[],
): SummaryBlock | null {
  if (sessionSetCount(session) === 0) return null;

  const effort = readEffort(session, allSessions);
  const hydration = readHydration(effort);
  const muscles = muscleBreakdown(session);
  const protein = estimateProteinG(effort, muscles.length);
  const calories = estimateCalories(effort);
  const topEffort = muscles.reduce((m, x) => Math.max(m, x.effort), 0);
  const glasses = `${hydration.glasses} ${hydration.glasses === 1 ? "glass" : "glasses"}`;

  return {
    eyebrow: "Session effort",
    badge: effort.label,
    meta:
      effort.vsTypicalPct !== null
        ? `${effort.vsTypicalPct}% of your usual session`
        : "Building your baseline — fills toward a full session",
    bar: Math.min(1, effort.ratio),
    musclesLabel: "Muscles worked",
    muscles: muscles.map((m) => ({
      name: MUSCLE_LABELS[m.muscle],
      detail: `${m.volume > 0 ? `${m.volume} kg` : "Bodyweight"} · ${formatClock(m.timeSec)}`,
      ratio: topEffort > 0 ? m.effort / topEffort : 0,
    })),
    hydration: `≈ ${hydration.liters.toFixed(1)} L · ${glasses}`,
    hydrationNote: hydration.note,
    protein: `≈ ${protein} g`,
    calories: `≈ ${calories} kcal`,
  };
}

/** A ledger row per logged exercise: index, name + muscles worked, set tally. */
function drawExercises(ctx: Ctx, session: TrainingSession, top: number, paint: boolean): number {
  const list = session.exercises.filter((ex) => ex.sets.length > 0);
  let y = top + 6;

  ctx.font = `700 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.brick;
    ctx.fillText(`EXERCISES — ${list.length}`, PAD, y);
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
  y += 10;

  if (list.length === 0) {
    ctx.font = `400 ${SET_SIZE}px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.inkSoft;
      ctx.fillText("No sets logged.", contentX, y);
    }
    return y + NAME_LH;
  }

  list.forEach((ex, i) => {
    const secondaries = ex.secondaryMuscles ?? [];
    const worked = [ex.muscle, ...secondaries].map((m) => MUSCLE_LABELS[m]).join(" · ");
    const eyebrow = `${worked} · ${EQUIPMENT_LABELS[ex.equipment]}`;
    const setTokens = ex.sets
      .map((s) => `${s.reps}×${s.weightKg > 0 ? `${round2(s.weightKg)} kg` : "BW"}`)
      .join("   ·   ");
    const onerm = ex.oneRmKg ?? ex.sets.reduce((m, s) => Math.max(m, epley1RM(s)), 0);
    const onermLine =
      onerm > 0 ? `1RM ${round2(onerm)} kg${ex.oneRmKg === undefined ? " est" : ""}` : "";

    ctx.font = `600 ${NAME_SIZE}px ${MONO}`;
    const nameLines = wrap(ctx, ex.name.trim() || "—", nameColW);
    ctx.font = `400 11px ${MONO}`;
    const eyeLines = wrap(ctx, eyebrow, nameColW);
    ctx.font = `400 ${SET_SIZE}px ${MONO}`;
    const setLines = wrap(ctx, setTokens || "—", setColW);

    const leftH = nameLines.length * NAME_LH + eyeLines.length * EYE_LH;
    const rightH = setLines.length * SET_LH + (onermLine ? EYE_LH : 0);
    const rowH = Math.max(leftH, rightH, NAME_LH) + ROW_PAD_V * 2;

    if (paint) {
      if (i % 2 === 1) {
        ctx.fillStyle = C.rowAlt;
        ctx.fillRect(PAD, y, CW, rowH);
      }

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

      ctx.fillStyle = C.ink;
      ctx.font = `600 ${NAME_SIZE}px ${MONO}`;
      nameLines.forEach((ln, li) => ctx.fillText(ln, contentX, y + ROW_PAD_V + li * NAME_LH));

      ctx.fillStyle = C.inkSoft;
      ctx.font = `400 11px ${MONO}`;
      eyeLines.forEach((ln, li) =>
        ctx.fillText(ln, contentX, y + ROW_PAD_V + nameLines.length * NAME_LH + li * EYE_LH),
      );

      ctx.fillStyle = C.brick;
      ctx.font = `400 ${SET_SIZE}px ${MONO}`;
      setLines.forEach((ln, li) => ctx.fillText(ln, setX, y + ROW_PAD_V + li * SET_LH));

      if (onermLine) {
        ctx.fillStyle = C.inkSoft;
        ctx.font = `400 11px ${MONO}`;
        ctx.fillText(onermLine, setX, y + ROW_PAD_V + setLines.length * SET_LH);
      }

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

function drawSession(
  ctx: Ctx,
  session: TrainingSession,
  logo: LogoFit | null,
  trainer: string,
  summary: SummaryBlock | null,
  paint: boolean,
): number {
  let y = drawHeader(ctx, {
    eyebrow: "GYM LOG · SESSION RECAP",
    title: session.name || "Session",
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

  ctx.font = `400 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkSoft;
    ctx.fillText(formatSessionDate(session.startedAt), PAD, y);
  }
  y += 18;

  const sets = sessionSetCount(session);
  const vol = sessionVolume(session);
  const meta =
    `${session.exercises.filter((ex) => ex.sets.length > 0).length} exercises · ${sets} sets` +
    (vol > 0 ? ` · ${vol} kg lifted` : "");
  ctx.font = `700 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    ctx.fillText(meta.toUpperCase(), PAD, y);
  }
  y += 24;

  if (summary) {
    y = drawSummaryBlock(ctx, PAD, y, CW, summary, paint);
    y += 8;
  }

  y = drawExercises(ctx, session, y, paint);
  y += 24;

  return drawFooter(ctx, y, "GYM LOG — SESSION RECAP", paint);
}

/** Render a session recap to a freshly created (high-DPI) canvas. */
export async function renderSessionToCanvas(
  session: TrainingSession,
  allSessions: TrainingSession[],
): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const logo = await resolveLogo();
  const trainer = loadTrainer();
  const summary = buildSessionSummary(session, allSessions);
  return paintPage((ctx, paint) => drawSession(ctx, session, logo, trainer, summary, paint));
}
