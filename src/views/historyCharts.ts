import { h } from "../dom";
import { dateLocale, registerTranslations, t } from "../i18n";

registerTranslations({
  "{0} days": "{0} zile",
  "History range": "Intervalul istoricului",
});

const fill1 = (s: string, v: number): string => s.replace("{0}", String(v));
import { svg } from "./healthSvg";

/**
 * Charts for the Water and Fuel history: a day-by-day line chart (one or more
 * series, gaps where nothing was logged, an optional dashed target) and a
 * week-by-week bar chart. SVG drawn at the host's pixel width, like the weight
 * trend; {@link responsiveChart} redraws it on resize.
 */

const H = 200;
const PAD = { l: 40, r: 10, t: 12, b: 24 };

export interface LineSeries {
  /** Values parallel to the chart's dates; null = nothing logged that day. */
  values: readonly (number | null)[];
  /** CSS class giving the stroke / fill colour (see `.hl-hist-*` in styles.css). */
  cls: string;
}

export interface DayLinesOpts {
  dates: readonly string[];
  series: readonly LineSeries[];
  /** Dashed horizontal target, drawn in the first series' colour. */
  target?: { value: number; label: string } | undefined;
  label: string;
}

const fmtTick = (v: number): string =>
  v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(v));

/** A "nice" step giving roughly four grid lines up to `hi`. */
function niceStep(hi: number): number {
  const raw = hi / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

const shortDate = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString(dateLocale(), { day: "numeric", month: "short" });

function yAxis(parts: SVGElement[], w: number, hi: number, Y: (v: number) => number): void {
  const step = niceStep(hi);
  for (let v = 0; v <= hi + 1e-9; v += step) {
    parts.push(
      svg("line", { x1: PAD.l, x2: w - PAD.r, y1: Y(v), y2: Y(v), class: "hl-chart-grid" }),
      svg("text", { x: PAD.l - 6, y: Y(v) + 3.5, "text-anchor": "end", class: "hl-chart-tick" }),
    );
    const t = parts[parts.length - 1];
    if (t) t.textContent = fmtTick(v);
  }
}

function tick(x: number, anchor: string, label: string): SVGElement {
  const el = svg("text", { x, y: H - 6, "text-anchor": anchor, class: "hl-chart-tick" });
  el.textContent = label;
  return el;
}

/** Day-by-day lines from zero; null if nothing in range was logged. */
export function dayLines(opts: DayLinesOpts, width: number): SVGElement | null {
  const { dates, series, target } = opts;
  const n = dates.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (!all.length || width <= 0 || n === 0) return null;
  const top = Math.max(...all, target?.value ?? 0) * 1.08 || 1;
  const hi = Math.ceil(top / niceStep(top)) * niceStep(top);
  const w = width;
  const X = (i: number): number => (n <= 1 ? (PAD.l + w - PAD.r) / 2 : PAD.l + (i / (n - 1)) * (w - PAD.l - PAD.r));
  const Y = (v: number): number => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);

  const parts: SVGElement[] = [];
  // Drawn over the lines (the target label, haloed).
  const late: SVGElement[] = [];
  yAxis(parts, w, hi, Y);
  parts.push(tick(PAD.l, "start", shortDate(dates[0] ?? "")));
  if (n > 2) parts.push(tick(X(Math.floor((n - 1) / 2)), "middle", shortDate(dates[Math.floor((n - 1) / 2)] ?? "")));
  if (n > 1) parts.push(tick(w - PAD.r, "end", shortDate(dates[n - 1] ?? "")));

  if (target) {
    const first = series[0];
    parts.push(
      svg("line", {
        x1: PAD.l,
        x2: w - PAD.r,
        y1: Y(target.value),
        y2: Y(target.value),
        class: `hl-hist-target ${first?.cls ?? ""}`,
      }),
    );
    const lbl = svg("text", { x: w - PAD.r, y: Y(target.value) - 4, "text-anchor": "end", class: "hl-chart-tick hl-hist-label" });
    lbl.textContent = target.label;
    late.push(lbl);
  }

  // Dots on short ranges only; a 90-day chart reads better as a bare line.
  const dotR = n <= 31 ? 2.6 : n <= 60 ? 1.6 : 0;
  for (const s of series) {
    // Split into runs of consecutive logged days, so an unlogged day is a gap.
    let run: string[] = [];
    const flush = (): void => {
      if (run.length > 1) parts.push(svg("polyline", { points: run.join(" "), class: `hl-hist-line ${s.cls}` }));
      run = [];
    };
    s.values.forEach((v, i) => {
      if (v === null) return flush();
      run.push(`${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
      // A lone logged day between gaps still shows as a dot.
      const lone = (s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null;
      if (dotR > 0 || lone) parts.push(svg("circle", { cx: X(i), cy: Y(v), r: dotR || 2, class: `hl-hist-dot ${s.cls}` }));
    });
    flush();
  }

  return svg("svg", { width: w, height: H, role: "img", "aria-label": opts.label }, [...parts, ...late]);
}

export interface WeekBar {
  /** Monday, "YYYY-MM-DD" */
  start: string;
  value: number;
  /** The budget for the days logged that week (target × days), marked across the bar. */
  budget: number | null;
}

/** Week-by-week bars with each week's budget marked; null if every week is empty. */
export function weekBars(bars: readonly WeekBar[], width: number, label: string): SVGElement | null {
  const n = bars.length;
  if (!n || width <= 0 || bars.every((b) => b.value <= 0)) return null;
  const top = Math.max(...bars.map((b) => Math.max(b.value, b.budget ?? 0))) * 1.12 || 1;
  const hi = Math.ceil(top / niceStep(top)) * niceStep(top);
  const w = width;
  const slot = (w - PAD.l - PAD.r) / n;
  const bw = Math.max(4, Math.min(36, slot * 0.62));
  const X = (i: number): number => PAD.l + slot * (i + 0.5);
  const Y = (v: number): number => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);

  const parts: SVGElement[] = [];
  yAxis(parts, w, hi, Y);
  const every = Math.ceil(n / Math.max(1, Math.floor((w - PAD.l - PAD.r) / 48)));
  bars.forEach((b, i) => {
    const x = X(i);
    if (b.value > 0) {
      const over = b.budget !== null && b.value > b.budget * 1.03;
      parts.push(
        svg("rect", {
          x: x - bw / 2,
          y: Y(b.value),
          width: bw,
          height: Math.max(0, Y(0) - Y(b.value)),
          class: `hl-hist-bar${over ? " is-over" : ""}`,
        }),
      );
      if (bw >= 18) {
        const v = svg("text", { x, y: Y(b.value) - 4, "text-anchor": "middle", class: "hl-chart-tick" });
        v.textContent = fmtTick(b.value);
        parts.push(v);
      }
    }
    if (b.budget !== null && b.budget > 0) {
      parts.push(
        svg("line", {
          x1: x - bw / 2 - 3,
          x2: x + bw / 2 + 3,
          y1: Y(b.budget),
          y2: Y(b.budget),
          class: "hl-hist-budget",
        }),
      );
    }
    if ((n - 1 - i) % every === 0) parts.push(tick(x, "middle", shortDate(b.start)));
  });

  return svg("svg", { width: w, height: H, role: "img", "aria-label": label }, parts);
}

/** A chart host that redraws at its own width; `dispose()` stops watching. */
export function responsiveChart(
  draw: (width: number) => SVGElement | null,
  emptyText: string,
): { el: HTMLElement; dispose: () => void } {
  const el = h("div", { class: "hl-chart" });
  let lastW = -1;
  const paint = (): void => {
    const w = Math.round(el.getBoundingClientRect().width);
    if (w === lastW) return;
    lastW = w;
    el.replaceChildren(draw(w) ?? h("p", { class: "empty", text: emptyText }));
  };
  const ro = new ResizeObserver(paint);
  ro.observe(el);
  return { el, dispose: () => ro.disconnect() };
}

/** A legend row: coloured swatch + label per series. */
export function legend(items: ReadonlyArray<{ cls: string; label: string }>): HTMLElement {
  return h(
    "div",
    { class: "hl-hist-legend" },
    items.map((it) => h("span", { class: "hl-hist-key" }, [h("span", { class: `hl-hist-swatch ${it.cls}` }), it.label])),
  );
}

/** A row of range chips; `onPick` repaints. Shared with the Water trend. */
export function rangeChips(current: number, ranges: readonly number[], onPick: (r: number) => void): HTMLElement {
  return h(
    "div",
    { class: "toggle hl-range", role: "group", aria: { label: t("History range") } },
    ranges.map((r) =>
      h("button", {
        class: `toggle-btn${r === current ? " active" : ""}`,
        type: "button",
        text: fill1(t("{0} days"), r),
        aria: { pressed: String(r === current) },
        on: { click: () => r !== current && onPick(r) },
      }),
    ),
  );
}
