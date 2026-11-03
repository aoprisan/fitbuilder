/**
 * Inline-SVG drawings for the Water and Fuel views: the volume glass, the
 * effective-hydration thermometer, the quick-pick glassware, the caffeine /
 * alcohol decay sparkline and the weight trend. Every colour is a theme token,
 * so the drawings follow the six themes like the rest of the app.
 */
import type { Point } from "../health/metabolism";
import {
  avg7,
  cutEndDate,
  daysBetween,
  effectiveStartWeight,
  sortedWeights,
  type CutState,
} from "../health/cutModel";

const NS = "http://www.w3.org/2000/svg";

type SvgAttrs = Record<string, string | number>;

/** Create an SVG element with attributes and children. */
export function svg(tag: string, attrs: SvgAttrs = {}, children: Element[] = []): SVGElement {
  const el = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.appendChild(c);
  return el;
}

function text(attrs: SvgAttrs, content: string): SVGElement {
  const el = svg("text", attrs);
  el.textContent = content;
  return el;
}

/* ─── the glass (raw volume) ─────────────────────────────────── */

const GLASS_TOP = 38;
const GLASS_BOTTOM = 286;
const HEADROOM = 8;
const GLASS_PATH = "M 38 38 L 50 270 Q 50 286, 64 286 L 136 286 Q 150 286, 150 270 L 162 38";

/** A drinking glass filled to `fraction` of the goal (animates up from empty). */
export function glassProgress(fraction: number, label: string): SVGElement {
  const pct = Math.max(0, Math.min(1.04, fraction));
  const waterY = GLASS_BOTTOM - pct * (GLASS_BOTTOM - GLASS_TOP - HEADROOM);
  const fill = svg("g", { class: "glass-water-fill" }, [
    svg("g", { class: "wave-back" }, [
      svg("path", {
        d: "M -200 0 Q -175 6, -150 0 Q -125 8, -100 0 Q -75 6, -50 0 Q -25 8, 0 0 Q 25 6, 50 0 Q 75 8, 100 0 Q 125 6, 150 0 Q 175 8, 200 0 Q 225 6, 250 0 Q 275 8, 300 0 L 300 320 L -200 320 Z",
        fill: "url(#hl-water-grad)",
      }),
    ]),
    svg("g", { class: "wave-front" }, [
      svg("path", {
        d: "M -200 4 Q -175 12, -150 4 Q -125 14, -100 4 Q -75 12, -50 4 Q -25 14, 0 4 Q 25 12, 50 4 Q 75 14, 100 4 Q 125 12, 150 4 Q 175 14, 200 4 Q 225 12, 250 4 Q 275 14, 300 4 L 300 22 L -200 22 Z",
        fill: "var(--drink-water)",
        opacity: 0.35,
      }),
    ]),
  ]);
  (fill as SVGGElement).style.transform = `translateY(${GLASS_BOTTOM}px)`;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => ((fill as SVGGElement).style.transform = `translateY(${waterY}px)`)),
  );

  return svg("svg", { viewBox: "0 0 200 300", class: "hl-glass", role: "img", "aria-label": label }, [
    svg("defs", {}, [
      svg("clipPath", { id: "hl-glass-clip" }, [
        svg("path", { d: `${GLASS_PATH} Z` }),
        svg("ellipse", { cx: 100, cy: 38, rx: 62, ry: 6 }),
      ]),
      svg("linearGradient", { id: "hl-water-grad", x1: 0, y1: 0, x2: 0, y2: 1 }, [
        svg("stop", { offset: "0%", "stop-color": "var(--drink-water)", "stop-opacity": 0.55 }),
        svg("stop", { offset: "100%", "stop-color": "var(--drink-water)", "stop-opacity": 0.95 }),
      ]),
    ]),
    svg("g", { "clip-path": "url(#hl-glass-clip)" }, [fill]),
    svg("path", {
      d: GLASS_PATH,
      fill: "none",
      stroke: "var(--ink)",
      "stroke-width": 3,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    svg("ellipse", {
      cx: 100,
      cy: 38,
      rx: 62,
      ry: 6,
      fill: "var(--paper)",
      stroke: "var(--ink)",
      "stroke-width": 3,
    }),
    svg("path", { d: "M 56 60 L 64 250", stroke: "var(--paper)", "stroke-width": 3, opacity: 0.45, fill: "none" }),
  ]);
}

/* ─── the thermometer (effective hydration) ───────────────────── */

const TUBE_TOP = 38;
const TUBE_BOTTOM = 268;
const BULB_CY = 290;

/** A thermometer tube filled to `fraction` of the goal, with 25/50/75/100 ticks. */
export function hydrationMeter(fraction: number, label: string): SVGElement {
  const pct = Math.max(0, Math.min(1.04, fraction));
  const fillY = TUBE_BOTTOM - pct * (TUBE_BOTTOM - TUBE_TOP);
  const ticks = [0.25, 0.5, 0.75, 1].map((tk) => {
    const y = TUBE_BOTTOM - tk * (TUBE_BOTTOM - TUBE_TOP);
    return svg("g", {}, [
      svg("line", { x1: 30, y1: y, x2: 44, y2: y, stroke: "var(--ink-soft)", "stroke-width": 1, opacity: tk === 1 ? 0.8 : 0.45 }),
      text(
        { x: 26, y: y + 3, "text-anchor": "end", "font-family": "var(--font-mono)", "font-size": 9, fill: "var(--ink-soft)" },
        String(Math.round(tk * 100)),
      ),
    ]);
  });
  const rect = svg("rect", { x: 40, y: TUBE_BOTTOM, width: 40, height: TUBE_BOTTOM - TUBE_TOP + 60, fill: "var(--drink-water)", class: "hl-meter-fill" });
  requestAnimationFrame(() => requestAnimationFrame(() => rect.setAttribute("y", String(fillY))));
  return svg("svg", { viewBox: "0 0 120 320", class: "hl-meter", role: "img", "aria-label": label }, [
    svg("defs", {}, [
      svg("clipPath", { id: "hl-meter-clip" }, [
        svg("rect", { x: 48, y: 38, width: 24, height: 232, rx: 12 }),
        svg("circle", { cx: 60, cy: BULB_CY, r: 22 }),
      ]),
    ]),
    ...ticks,
    svg("g", { "clip-path": "url(#hl-meter-clip)" }, [
      rect,
      svg("circle", { cx: 60, cy: BULB_CY, r: 22, fill: "var(--drink-water)" }),
    ]),
    svg("rect", { x: 48, y: 38, width: 24, height: 232, rx: 12, fill: "none", stroke: "var(--ink)", "stroke-width": 2.6 }),
    svg("circle", { cx: 60, cy: BULB_CY, r: 22, fill: "none", stroke: "var(--ink)", "stroke-width": 2.6 }),
    ...(fraction >= 1
      ? [svg("circle", { cx: 92, cy: TUBE_TOP, r: 5, fill: "var(--mustard)" })]
      : []),
  ]);
}

/* ─── quick-pick glassware ─────────────────────────────────── */

const GLASSWARE: Record<number, string[]> = {
  150: ["M 20 32 L 19 60 Q 19 64, 23 64 L 37 64 Q 41 64, 41 60 L 40 32 Z", "M 20 32 L 40 32"],
  250: ["M 18 22 L 16 62 Q 16 66, 20 66 L 40 66 Q 44 66, 44 62 L 42 22 Z", "M 18 22 L 42 22"],
  330: [
    "M 20 16 Q 20 14, 22 14 L 38 14 Q 40 14, 40 16 L 40 64 Q 40 66, 38 66 L 22 66 Q 20 66, 20 64 Z",
    "M 20 20 L 40 20",
    "M 20 60 L 40 60",
  ],
  500: [
    "M 24 4 L 36 4 L 36 14 L 24 14 Z",
    "M 19 18 L 17 70 Q 17 74, 21 74 L 39 74 Q 43 74, 43 70 L 41 18 Z",
    "M 19 26 L 41 26",
  ],
  750: [
    "M 27 4 L 27 22 Q 19 26, 19 34 L 18 72 Q 18 76, 22 76 L 38 76 Q 42 76, 42 72 L 41 34 Q 41 26, 33 22 L 33 4 Z",
    "M 19 38 L 41 38",
  ],
  1000: [
    "M 13 24 L 11 72 Q 11 76, 15 76 L 37 76 Q 41 76, 41 72 L 39 24 Z",
    "M 41 36 Q 52 40, 52 52 Q 52 60, 41 62",
  ],
};

/** A line drawing of the vessel that holds `ml` (cup, glass, can, bottle, carafe, jug). */
export function glasswareIcon(ml: number): SVGElement {
  const paths = GLASSWARE[ml] ?? GLASSWARE[250] ?? [];
  return svg(
    "svg",
    { viewBox: "0 0 60 80", class: "hl-glassware", "aria-hidden": "true" },
    paths.map((d, i) => svg("path", { d, class: i === 0 ? "hl-glassware-body" : "" })),
  );
}

/* ─── decay sparkline ─────────────────────────────────────── */

const CW = 320;
const CH = 76;
const PAD_TOP = 8;
const PAD_BOTTOM = 12;

/** Load over time: solid up to now, dashed for the projection, a tick where it clears. */
export function decayCurve(
  points: readonly Point[],
  now: number,
  clearAt: number | null,
  accentVar: string,
  label: string,
): SVGElement | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) return null;
  const from = first.t;
  const to = last.t;
  const span = Math.max(1, to - from);
  const peak = Math.max(...points.map((p) => p.v), Number.EPSILON);
  const x = (tm: number): number => ((tm - from) / span) * CW;
  const y = (v: number): number => PAD_TOP + (1 - v / peak) * (CH - PAD_TOP - PAD_BOTTOM);
  const path = (pts: readonly Point[]): string =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(2)} ${y(p.v).toFixed(2)}`).join(" ");

  const past = points.filter((p) => p.t <= now);
  const future = points.filter((p) => p.t >= now);
  const pastFirst = past[0];
  const pastLast = past[past.length - 1];
  const nowX = x(Math.min(Math.max(now, from), to));
  const nowV = pastLast ? pastLast.v : first.v;
  const baseY = y(0);
  const accent = `var(${accentVar})`;

  const parts: SVGElement[] = [
    svg("line", { x1: 0, y1: baseY, x2: CW, y2: baseY, stroke: "var(--ink-faint)", "stroke-width": 1 }),
  ];
  if (past.length > 1 && pastFirst && pastLast) {
    parts.push(
      svg("path", {
        d: `${path(past)} L ${x(pastLast.t).toFixed(2)} ${baseY} L ${x(pastFirst.t).toFixed(2)} ${baseY} Z`,
        fill: accent,
        opacity: 0.15,
      }),
      svg("path", { d: path(past), fill: "none", stroke: accent, "stroke-width": 2 }),
    );
  }
  if (future.length > 1) {
    parts.push(
      svg("path", { d: path(future), fill: "none", stroke: accent, "stroke-width": 1.5, "stroke-dasharray": "3 3", opacity: 0.75 }),
    );
  }
  parts.push(
    svg("line", { x1: nowX, y1: PAD_TOP - 4, x2: nowX, y2: baseY, stroke: "var(--ink-soft)", "stroke-width": 0.8, "stroke-dasharray": "2 3" }),
    svg("circle", { cx: nowX, cy: y(nowV), r: 3.4, fill: accent }),
  );
  if (clearAt !== null && clearAt <= to) {
    parts.push(svg("circle", { cx: x(clearAt), cy: baseY, r: 3, fill: "var(--pine)" }));
  }
  return svg(
    "svg",
    { viewBox: `0 0 ${CW} ${CH}`, class: "hl-curve", role: "img", "aria-label": label, preserveAspectRatio: "none" },
    parts,
  );
}

/* ─── weight trend ─────────────────────────────────────────── */

const WH = 220;
const WPAD = { l: 36, r: 10, t: 12, b: 24 };

/**
 * Weigh-ins as dots, the 7-day average as a line, and the cut's target pace
 * dashed. Drawn at the host's current width; call again on resize.
 */
export function weightChart(state: CutState, today: string, width: number, label: string): SVGElement | null {
  const s = state.settings;
  const ws = sortedWeights(state);
  const firstW = ws[0];
  const lastW = ws[ws.length - 1];
  if (!firstW || !lastW || width <= 0) return null;
  const start = effectiveStartWeight(state);
  const end = cutEndDate(s);
  const first = firstW[0] < s.startDate ? firstW[0] : s.startDate;
  const last = [end, today, lastW[0]].sort().pop() ?? today;
  const span = Math.max(1, daysBetween(first, last));
  const vals = ws.map(([, v]) => v);
  if (start !== null) vals.push(start);
  if (s.goalWeight !== null) vals.push(s.goalWeight);
  const lo = Math.min(...vals) - 0.8;
  const hi = Math.max(...vals) + 0.8;
  const w = width;
  const X = (d: string): number => WPAD.l + (daysBetween(first, d) / span) * (w - WPAD.l - WPAD.r);
  const Y = (v: number): number => WPAD.t + ((hi - v) / (hi - lo)) * (WH - WPAD.t - WPAD.b);

  const step = hi - lo > 8 ? 2 : 1;
  const parts: SVGElement[] = [];
  for (let v = Math.ceil(lo); v <= hi; v += step) {
    parts.push(
      svg("line", { x1: WPAD.l, x2: w - WPAD.r, y1: Y(v), y2: Y(v), class: "hl-chart-grid" }),
      text({ x: WPAD.l - 6, y: Y(v) + 3.5, "text-anchor": "end", class: "hl-chart-tick" }, String(v)),
    );
  }
  parts.push(
    text({ x: WPAD.l, y: WH - 6, class: "hl-chart-tick" }, first.slice(5)),
    text({ x: w - WPAD.r, y: WH - 6, "text-anchor": "end", class: "hl-chart-tick" }, last.slice(5)),
  );
  const tx = X(today);
  if (tx > WPAD.l && tx < w - WPAD.r) {
    parts.push(svg("line", { x1: tx, x2: tx, y1: WPAD.t, y2: WH - WPAD.b, class: "hl-chart-today" }));
  }
  if (start !== null && s.goalWeight !== null) {
    parts.push(
      svg("line", { x1: X(s.startDate), y1: Y(start), x2: X(end), y2: Y(s.goalWeight), class: "hl-chart-pace" }),
    );
  }
  for (const [d, v] of ws) parts.push(svg("circle", { cx: X(d), cy: Y(v), r: 2.8, class: "hl-chart-dot" }));
  const avgPts = ws
    .map(([d]) => [d, avg7(state, d)] as const)
    .filter((p): p is readonly [string, number] => p[1] !== null)
    .map(([d, a]) => `${X(d).toFixed(1)},${Y(a).toFixed(1)}`);
  if (avgPts.length > 1) parts.push(svg("polyline", { points: avgPts.join(" "), class: "hl-chart-avg" }));

  return svg("svg", { width: w, height: WH, role: "img", "aria-label": label }, parts);
}

/* ─── waist guide ─────────────────────────────────────────── */

/** A line-drawn torso with the tape level through the navel. */
export function navelFigure(label: string, navelText: string): SVGElement {
  const ticks = [66, 78, 90, 110, 122, 134].map((x) => {
    const y = 151 - 9 * ((x - 100) / 46) ** 2;
    return svg("line", { class: "hl-navel-tick", x1: x, y1: y - 2, x2: x, y2: y + 2 });
  });
  return svg("svg", { class: "hl-navel", viewBox: "0 0 200 230", role: "img", "aria-label": label }, [
    svg("path", {
      class: "hl-navel-body",
      d: "M58 14 C70 24 84 28 100 28 C116 28 130 24 142 14 C150 40 150 70 144 96 C139 118 140 136 146 158 C152 180 154 200 152 222 M58 14 C50 40 50 70 56 96 C61 118 60 136 54 158 C48 180 46 200 48 222",
    }),
    svg("path", { class: "hl-navel-hint", d: "M72 58 C82 66 92 66 98 62 M128 58 C118 66 108 66 102 62" }),
    svg("path", { class: "hl-navel-hint", d: "M80 96 C88 104 96 108 100 108 C104 108 112 104 120 96" }),
    svg("path", { class: "hl-navel-hint", d: "M66 182 C72 192 80 200 88 204 M134 182 C128 192 120 200 112 204" }),
    svg("path", { class: "hl-navel-tape-back", d: "M56 140 C70 130 130 130 144 140" }),
    svg("path", { class: "hl-navel-tape", d: "M54 142 C70 154 130 154 146 142" }),
    ...ticks,
    svg("circle", { class: "hl-navel-dot", cx: 100, cy: 151, r: 2.8 }),
    svg("line", { class: "hl-navel-level", x1: 20, y1: 151, x2: 180, y2: 151 }),
    text({ class: "hl-navel-label", x: 184, y: 146, "text-anchor": "end" }, navelText),
  ]);
}
