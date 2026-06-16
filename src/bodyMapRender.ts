import {
  BODY_METRIC_LABELS,
  type BodyMetric,
  METRIC_LEGEND,
  metricColor,
  muscleScores,
} from "./bodyMap";
import {
  C,
  CW,
  type Ctx,
  drawFooter,
  drawHeader,
  ensureFonts,
  type LogoFit,
  MONO,
  PAD,
  paintPage,
  resolveLogo,
  roundRect,
  wrap,
} from "./canvasKit";
import { loadTrainer } from "./trainer";
import type { MuscleGroup, TrainingSession } from "./types";

/* Renders the Body Map as a one-page sheet: three stylised figures — Front,
   Back and a Side profile — each muscle shaded by the selected metric, plus a
   legend gradient. Backs the body-map PNG/PDF export and the native share sheet.

   The figures are authored from plain Canvas-2D primitives (ellipses, boxes,
   polygons) so the export stays dependency-free and never depends on WebGL/
   Three.js being available — the same reason `bodySvg.ts` exists as the on-screen
   fallback. Front and Back reuse that diagram's anatomy; the Side profile is
   authored here. Coordinates live in a local 100×216 box (centre x≈50) and are
   scaled to fit three columns across the page. */

type Pt = readonly [number, number];
type Shape =
  | { k: "ell"; cx: number; cy: number; rx: number; ry: number }
  | { k: "box"; x: number; y: number; w: number; h: number; r: number }
  | { k: "poly"; pts: Pt[] };

const ell = (cx: number, cy: number, rx: number, ry: number): Shape => ({ k: "ell", cx, cy, rx, ry });
const box = (x: number, y: number, w: number, h: number, r: number): Shape => ({ k: "box", x, y, w, h, r });
const poly = (...pts: Pt[]): Shape => ({ k: "poly", pts });

interface Region {
  muscle: MuscleGroup;
  shapes: Shape[];
}
interface BodyView {
  label: string;
  regions: Region[];
  inert: Shape[];
}

// Head / neck / hands / knees / feet — drawn for shape, never coloured.
const FRONT_INERT: Shape[] = [
  ell(50, 16, 11, 13),
  box(45, 26, 10, 9, 3),
  ell(16, 103, 4, 4),
  ell(84, 103, 4, 4),
  ell(42, 152, 5, 5),
  ell(58, 152, 5, 5),
  ell(42, 196, 6, 4),
  ell(58, 196, 6, 4),
];

// — Anterior figure (mirrors bodySvg's front). —
const FRONT: BodyView = {
  label: "Front",
  inert: FRONT_INERT,
  regions: [
    { muscle: "traps", shapes: [poly([36, 41], [50, 30], [50, 41]), poly([64, 41], [50, 30], [50, 41])] },
    { muscle: "front-delts", shapes: [ell(30, 45, 7, 7), ell(70, 45, 7, 7)] },
    { muscle: "side-delts", shapes: [ell(22, 40, 4, 6), ell(78, 40, 4, 6)] },
    { muscle: "chest", shapes: [ell(41, 52, 9, 7), ell(59, 52, 9, 7)] },
    { muscle: "biceps", shapes: [ell(22, 63, 6, 12), ell(78, 63, 6, 12)] },
    { muscle: "forearms", shapes: [ell(18, 87, 5, 13), ell(82, 87, 5, 13)] },
    { muscle: "core", shapes: [box(42, 60, 16, 34, 4)] },
    { muscle: "legs", shapes: [ell(42, 128, 8, 22), ell(58, 128, 8, 22)] },
    { muscle: "calves", shapes: [ell(42, 175, 6, 18), ell(58, 175, 6, 18)] },
  ],
};

// — Posterior figure (mirrors bodySvg's back, recentred on x=50). —
const BACK: BodyView = {
  label: "Back",
  inert: FRONT_INERT,
  regions: [
    { muscle: "traps", shapes: [poly([36, 41], [50, 30], [64, 41], [50, 57])] },
    { muscle: "rear-delts", shapes: [ell(30, 45, 7, 7), ell(70, 45, 7, 7)] },
    { muscle: "side-delts", shapes: [ell(22, 40, 4, 6), ell(78, 40, 4, 6)] },
    { muscle: "back", shapes: [ell(38, 68, 8, 13), ell(62, 68, 8, 13)] },
    { muscle: "triceps", shapes: [ell(22, 63, 6, 12), ell(78, 63, 6, 12)] },
    { muscle: "forearms", shapes: [ell(18, 87, 5, 13), ell(82, 87, 5, 13)] },
    { muscle: "lower-back", shapes: [box(42, 80, 16, 14, 3)] },
    { muscle: "glutes", shapes: [ell(42, 104, 9, 9), ell(58, 104, 9, 9)] },
    { muscle: "legs", shapes: [ell(42, 131, 8, 20), ell(58, 131, 8, 20)] },
    { muscle: "calves", shapes: [ell(42, 175, 7, 18), ell(58, 175, 7, 18)] },
  ],
};

// — Side profile, facing right (larger x = anterior). Authored here. —
const SIDE: BodyView = {
  label: "Side",
  inert: [
    ell(52, 16, 11, 13), // head
    box(47, 26, 10, 9, 3), // neck
    ell(51, 108, 4, 4), // hand
    ell(50, 153, 5, 5), // knee
    ell(58, 197, 11, 4), // foot (points forward)
  ],
  regions: [
    { muscle: "traps", shapes: [poly([40, 38], [52, 32], [52, 46], [38, 50])] },
    { muscle: "side-delts", shapes: [ell(50, 45, 8, 8)] },
    { muscle: "chest", shapes: [ell(60, 54, 7, 8)] },
    { muscle: "back", shapes: [ell(40, 66, 7, 14)] },
    { muscle: "core", shapes: [ell(58, 78, 6, 13)] },
    { muscle: "biceps", shapes: [ell(55, 67, 4, 11)] },
    { muscle: "triceps", shapes: [ell(47, 67, 4, 11)] },
    { muscle: "forearms", shapes: [ell(51, 92, 5, 13)] },
    { muscle: "glutes", shapes: [ell(38, 104, 10, 11)] },
    { muscle: "legs", shapes: [ell(50, 130, 10, 24)] },
    { muscle: "calves", shapes: [ell(46, 176, 8, 18)] },
  ],
};

const VIEWS: readonly BodyView[] = [FRONT, BACK, SIDE];

/** Local figure box, scaled to fit each page column. */
const FIG_W = 100;
const FIG_H = 216;
const GAP = 18;

/** Trace one shape into the current path at (ox, oy) with scale `sc`. */
function tracePath(ctx: Ctx, s: Shape, ox: number, oy: number, sc: number): void {
  ctx.beginPath();
  if (s.k === "ell") {
    ctx.ellipse(ox + s.cx * sc, oy + s.cy * sc, s.rx * sc, s.ry * sc, 0, 0, Math.PI * 2);
  } else if (s.k === "box") {
    roundRect(ctx, ox + s.x * sc, oy + s.y * sc, s.w * sc, s.h * sc, s.r * sc);
  } else {
    const first = s.pts[0];
    if (!first) return;
    ctx.moveTo(ox + first[0] * sc, oy + first[1] * sc);
    for (let i = 1; i < s.pts.length; i++) {
      const p = s.pts[i];
      if (p) ctx.lineTo(ox + p[0] * sc, oy + p[1] * sc);
    }
    ctx.closePath();
  }
}

function paintShape(ctx: Ctx, s: Shape, ox: number, oy: number, sc: number, fill: string, stroke: string): void {
  tracePath(ctx, s, ox, oy, sc);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawFigure(
  ctx: Ctx,
  view: BodyView,
  ox: number,
  oy: number,
  sc: number,
  colorFor: (m: MuscleGroup) => string,
): void {
  for (const s of view.inert) paintShape(ctx, s, ox, oy, sc, C.panel, C.line);
  for (const r of view.regions) {
    const fill = colorFor(r.muscle);
    for (const s of r.shapes) paintShape(ctx, s, ox, oy, sc, fill, C.lineStrong);
  }
}

function drawBodyMap(
  ctx: Ctx,
  metric: BodyMetric,
  colorFor: (m: MuscleGroup) => string,
  logo: LogoFit | null,
  trainer: string,
  paint: boolean,
): number {
  let y = drawHeader(ctx, { eyebrow: "GYM LOG · BODY MAP", title: "Body Map", logo, paint });

  if (trainer) {
    ctx.font = `700 12px ${MONO}`;
    if (paint) {
      ctx.fillStyle = C.brick;
      ctx.fillText(`TRAINER · ${trainer.toUpperCase()}`, PAD, y);
    }
    y += 20;
  }

  const lg = METRIC_LEGEND[metric];
  ctx.font = `700 12px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.brick;
    ctx.fillText(`METRIC · ${BODY_METRIC_LABELS[metric].toUpperCase()}`, PAD, y);
  }
  y += 20;

  ctx.font = `400 12px ${MONO}`;
  for (const ln of wrap(ctx, lg.desc, CW)) {
    if (paint) {
      ctx.fillStyle = C.inkSoft;
      ctx.fillText(ln, PAD, y);
    }
    y += 17;
  }
  y += 14;

  // Three figures across the content width.
  const col = (CW - GAP * 2) / 3;
  const sc = col / FIG_W;
  const figTop = y;
  const figH = FIG_H * sc;
  VIEWS.forEach((view, i) => {
    const ox = PAD + i * (col + GAP);
    if (paint) drawFigure(ctx, view, ox, figTop, sc, colorFor);
  });
  y = figTop + figH + 6;

  // Captions centred under each figure.
  ctx.font = `700 12px ${MONO}`;
  if (paint) {
    ctx.textAlign = "center";
    ctx.fillStyle = C.brick;
    VIEWS.forEach((view, i) => {
      const cx = PAD + i * (col + GAP) + col / 2;
      ctx.fillText(view.label.toUpperCase(), cx, y);
    });
    ctx.textAlign = "left";
  }
  y += 26;

  // Legend: a gradient bar sampled across the metric ramp, with end labels.
  ctx.font = `700 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkFaint;
    ctx.fillText("SCALE", PAD, y);
  }
  y += 16;
  const barH = 12;
  if (paint) {
    const grad = ctx.createLinearGradient(PAD, 0, PAD + CW, 0);
    for (const stop of [0, 0.25, 0.5, 0.75, 1]) grad.addColorStop(stop, metricColor(metric, stop));
    roundRect(ctx, PAD, y, CW, barH, barH / 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  y += barH + 16;
  ctx.font = `400 11px ${MONO}`;
  if (paint) {
    ctx.fillStyle = C.inkSoft;
    ctx.fillText(lg.lowLabel, PAD, y);
    ctx.textAlign = "right";
    ctx.fillText(lg.highLabel, PAD + CW, y);
    ctx.textAlign = "left";
  }
  y += 18;

  return drawFooter(ctx, y, "GYM LOG — BODY MAP", paint);
}

/** Render the body map for one metric to a freshly created (high-DPI) canvas. */
export async function renderBodyMapToCanvas(
  metric: BodyMetric,
  sessions: TrainingSession[],
): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const logo = await resolveLogo();
  const trainer = loadTrainer();

  const scores = muscleScores(metric, sessions);
  const colorFor = (m: MuscleGroup): string => metricColor(metric, scores.get(m)?.value ?? null);

  return paintPage((ctx, paint) => drawBodyMap(ctx, metric, colorFor, logo, trainer, paint));
}
