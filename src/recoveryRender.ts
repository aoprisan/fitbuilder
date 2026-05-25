import {
  C,
  CW,
  DISPLAY,
  drawBar,
  drawFooter,
  drawHeader,
  ensureFonts,
  type LogoFit,
  MONO,
  PAD,
  paintPage,
  resolveLogo,
  roundRect,
  type Ctx,
  wrap,
} from "./canvasKit";
import {
  muscleRecovery,
  type MuscleRecovery,
  overallRecovery,
  overallStatus,
  recoveryColor,
  systemicNote,
  systemicRecovery,
} from "./recovery";
import { loadTrainer } from "./trainer";
import { MUSCLE_LABELS, type TrainingSession } from "./types";
import { clamp, formatSessionDate } from "./util";

/* Renders the Recovery screen as a one-page board: the overall + systemic
   readiness gauges and a ledger of per-muscle recovery bars. Backs the recovery
   PNG/PDF export and the native share sheet. */

const PP = 18;
const RING_R = 46;

/** A red→green recovery gauge with its percentage and status word in the centre. */
function drawRing(ctx: Ctx, cx: number, cy: number, recovered: number): void {
  const color = recoveryColor(recovered);
  const frac = clamp(recovered, 0, 1);
  const start = -Math.PI / 2;

  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(cx, cy, RING_R, 0, Math.PI * 2);
  ctx.strokeStyle = C.track;
  ctx.lineWidth = 10;
  ctx.stroke();

  if (frac > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, RING_R, start, start + Math.PI * 2 * frac);
    ctx.strokeStyle = color;
    ctx.lineWidth = 13;
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `400 30px ${DISPLAY}`;
  ctx.fillStyle = color;
  ctx.fillText(`${Math.round(recovered * 100)}%`, cx, cy - 4);
  ctx.font = `700 9px ${MONO}`;
  ctx.fillStyle = C.brick;
  ctx.fillText(overallStatus(recovered).toUpperCase(), cx, cy + 20);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

interface OverallSpec {
  overall: number;
  systemic: number;
  muscleNote: string;
  sysNote: string;
}

/** The bordered "Overall" panel: the two gauges side by side plus the two notes. */
function drawOverall(ctx: Ctx, y: number, spec: OverallSpec, paint: boolean): number {
  const innerX = PAD + PP;
  const innerW = CW - PP * 2;

  const eyebrowY = y + PP;
  const ringCenterY = eyebrowY + 24 + RING_R;
  const captionY = ringCenterY + RING_R + 16;
  const notesStartY = captionY + 16 + 8;

  ctx.font = `400 12px ${MONO}`;
  const muscleLines = wrap(ctx, spec.muscleNote, innerW);
  const sysLines = wrap(ctx, spec.sysNote, innerW);
  const bottom = notesStartY + muscleLines.length * 17 + 6 + sysLines.length * 17 + PP;

  if (paint) {
    roundRect(ctx, PAD, y, CW, bottom - y, 8);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textBaseline = "top";
    ctx.font = `700 11px ${MONO}`;
    ctx.fillStyle = C.brick;
    ctx.fillText("OVERALL", innerX, eyebrowY);

    const half = innerW / 2;
    const cxL = innerX + half * 0.5;
    const cxR = innerX + half * 1.5;
    drawRing(ctx, cxL, ringCenterY, spec.overall);
    drawRing(ctx, cxR, ringCenterY, spec.systemic);

    ctx.textAlign = "center";
    ctx.font = `700 11px ${MONO}`;
    ctx.fillStyle = C.inkFaint;
    ctx.fillText("MUSCLES", cxL, captionY);
    ctx.fillText("SYSTEMIC", cxR, captionY);
    ctx.textAlign = "left";

    let ny = notesStartY;
    ctx.font = `400 12px ${MONO}`;
    ctx.fillStyle = C.inkSoft;
    for (const ln of muscleLines) {
      ctx.fillText(ln, innerX, ny);
      ny += 17;
    }
    ny += 6;
    for (const ln of sysLines) {
      ctx.fillText(ln, innerX, ny);
      ny += 17;
    }
  }

  return bottom;
}

/** One ledger row per muscle: name, recovery stat, coloured bar, last-trained note. */
function drawMuscleRows(ctx: Ctx, top: number, recoveries: MuscleRecovery[], paint: boolean): number {
  let y = top;

  ctx.font = `700 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.brick;
    ctx.fillText("MUSCLE RECOVERY", PAD, y);
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
  y += 12;

  recoveries.forEach((r, i) => {
    const pct = Math.round(r.recovered * 100);
    const color = recoveryColor(r.recovered);
    const stat = r.recovered >= 1 ? "Ready" : `${pct}% · ~${r.hoursRemaining}h`;
    const detail = r.lastTrainedAt
      ? `Last trained ${formatSessionDate(r.lastTrainedAt)}`
      : "Not trained yet";

    if (paint) {
      ctx.textBaseline = "top";
      ctx.font = `600 13px ${MONO}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(MUSCLE_LABELS[r.muscle], PAD, y);

      ctx.textAlign = "right";
      ctx.font = `700 12px ${MONO}`;
      ctx.fillStyle = color;
      ctx.fillText(stat, PAD + CW, y);
      ctx.textAlign = "left";
    }
    y += 19;

    if (paint) drawBar(ctx, PAD, y, CW, 8, r.recovered, color);
    y += 14;

    if (paint) {
      ctx.font = `400 11px ${MONO}`;
      ctx.fillStyle = C.inkFaint;
      ctx.fillText(detail, PAD, y);
    }
    y += 16;

    if (paint && i < recoveries.length - 1) {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y + 0.5);
      ctx.lineTo(PAD + CW, y + 0.5);
      ctx.stroke();
    }
    y += 12;
  });

  return y;
}

function drawRecovery(
  ctx: Ctx,
  recoveries: MuscleRecovery[],
  overall: OverallSpec,
  logo: LogoFit | null,
  trainer: string,
  paint: boolean,
): number {
  let y = drawHeader(ctx, { eyebrow: "GYM LOG · RECOVERY", title: "Recovery", logo, paint });

  if (trainer) {
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText(`TRAINER · ${trainer.toUpperCase()}`, PAD, y);
    }
    y += 20;
  }

  ctx.font = `400 12px ${MONO}`;
  for (const ln of wrap(
    ctx,
    "How recovered each muscle is since you last trained it — red just-worked, green ready to train again.",
    CW,
  )) {
    if (paint) {
      ctx.fillStyle = C.inkSoft;
      ctx.fillText(ln, PAD, y);
    }
    y += 17;
  }
  y += 12;

  y = drawOverall(ctx, y, overall, paint);
  y += 20;

  y = drawMuscleRows(ctx, y, recoveries, paint);
  y += 12;

  return drawFooter(ctx, y, "GYM LOG — RECOVERY", paint);
}

/** Render the recovery board to a freshly created (high-DPI) canvas. */
export async function renderRecoveryToCanvas(
  sessions: TrainingSession[],
): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const logo = await resolveLogo();
  const trainer = loadTrainer();

  const recoveries = muscleRecovery(sessions);
  const systemic = systemicRecovery(sessions);
  const recovering = recoveries.filter((r) => r.recovered < 1).length;
  const overall: OverallSpec = {
    overall: overallRecovery(recoveries),
    systemic: systemic.readiness,
    muscleNote:
      recovering === 0
        ? "Every muscle group is fully recovered — good to go."
        : `${recovering} muscle ${recovering === 1 ? "group" : "groups"} still recovering — train the green ones.`,
    sysNote: systemicNote(systemic.readiness, systemic.hoursRemaining),
  };

  return paintPage((ctx, paint) => drawRecovery(ctx, recoveries, overall, logo, trainer, paint));
}
