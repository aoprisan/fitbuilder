import { h } from "../dom";
import { registerTranslations, t } from "../i18n";
import { round2 } from "../util";

registerTranslations({
  "{0} over time": "{0} în timp",
  "first session": "prima sesiune",
  "no change": "fără schimbare",
});

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export interface LineChartOpts {
  title: string;
  /** Unit shown beside readouts, e.g. "kg" or "reps". */
  unit: string;
  /** Chronological values, one per session. Must be non-empty. */
  values: number[];
  /** X-axis labels, parallel to {@link values}. */
  labels: string[];
  /** Stroke colour (any CSS colour). Defaults to signal red. */
  color?: string;
  /** One-line explanation of what the metric measures. */
  hint?: string;
  /** Formats a value for display. Defaults to a 2-decimal round. */
  format?: (n: number) => string;
  /**
   * A dashed target/estimate line drawn into the same scale as the series (its
   * value is folded into the y-domain so the line always lands inside the plot).
   * Labelled at the left edge, opposite the peak readout.
   */
  reference?: { value: number; label: string };
}

// Internal viewBox; CSS scales the svg to its container width.
const W = 320;
const H = 150;
const PAD_L = 8;
const PAD_R = 10;
const PAD_T = 14;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/**
 * A compact progress line chart rendered as a `card`: a header with the latest
 * reading and its change since the first session, then an SVG line over time.
 */
export function lineChart(opts: LineChartOpts): HTMLElement {
  const fmt = opts.format ?? ((n: number) => String(round2(n)));
  const color = opts.color ?? "var(--signal)";
  const { values, labels, unit, title } = opts;
  const n = values.length;

  const reference = opts.reference;
  // The reference line shares the series' scale, so it has to widen the domain.
  const domain = reference ? [...values, reference.value] : values;
  const max = Math.max(...domain);
  const min = Math.min(...domain);
  const span = max - min || 1;
  const first = values[0] ?? 0;
  const last = values[n - 1] ?? 0;
  const delta = round2(last - first);

  const xAt = (i: number): number => (n <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (n - 1)) * PLOT_W);
  const yAt = (v: number): number =>
    max === min ? PAD_T + PLOT_H / 2 : PAD_T + (1 - (v - min) / span) * PLOT_H;

  const svg = svgEl("svg", {
    class: "stat-chart-svg",
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": t("{0} over time").replace("{0}", title),
  });

  const baselineY = PAD_T + PLOT_H;

  // Faint peak guide line + its value at the right end. Pinned to the series'
  // own peak, which a reference line may sit above.
  const peak = Math.max(...values);
  svg.appendChild(
    svgEl("line", {
      class: "stat-chart-guide",
      x1: String(PAD_L),
      y1: String(yAt(peak)),
      x2: String(PAD_L + PLOT_W),
      y2: String(yAt(peak)),
    }),
  );
  const peakText = svgEl("text", {
    class: "stat-chart-peak",
    x: String(PAD_L + PLOT_W),
    y: String(Math.max(9, yAt(peak) - 3)),
    "text-anchor": "end",
  });
  peakText.textContent = fmt(peak);
  svg.appendChild(peakText);

  // The target/estimate line, labelled at the left so it clears the peak value.
  if (reference) {
    svg.appendChild(
      svgEl("line", {
        class: "stat-chart-ref",
        x1: String(PAD_L),
        y1: String(yAt(reference.value)),
        x2: String(PAD_L + PLOT_W),
        y2: String(yAt(reference.value)),
        stroke: color,
      }),
    );
    const refText = svgEl("text", {
      class: "stat-chart-ref-label",
      x: String(PAD_L),
      y: String(Math.max(9, yAt(reference.value) - 3)),
    });
    refText.textContent = reference.label;
    svg.appendChild(refText);
  }

  // Baseline.
  svg.appendChild(
    svgEl("line", {
      class: "stat-chart-axis",
      x1: String(PAD_L),
      y1: String(baselineY),
      x2: String(PAD_L + PLOT_W),
      y2: String(baselineY),
    }),
  );

  const coords = values.map((v, i) => `${xAt(i)},${yAt(v)}`);

  // Filled area under the line (skipped for a single point).
  if (n > 1) {
    const areaPts = `${PAD_L},${baselineY} ${coords.join(" ")} ${PAD_L + PLOT_W},${baselineY}`;
    svg.appendChild(
      svgEl("polygon", { class: "stat-chart-area", points: areaPts, fill: color }),
    );
    svg.appendChild(
      svgEl("polyline", { class: "stat-chart-line", points: coords.join(" "), stroke: color }),
    );
  }

  // Data dots; the latest reading is emphasised.
  values.forEach((v, i) => {
    svg.appendChild(
      svgEl("circle", {
        class: i === n - 1 ? "stat-chart-dot stat-chart-dot-now" : "stat-chart-dot",
        cx: String(xAt(i)),
        cy: String(yAt(v)),
        r: i === n - 1 ? "4.5" : "3",
        fill: color,
      }),
    );
  });

  const deltaClass =
    delta > 0 ? "stat-chart-delta up" : delta < 0 ? "stat-chart-delta down" : "stat-chart-delta flat";
  const deltaText =
    n <= 1
      ? t("first session")
      : delta > 0
        ? `▲ +${fmt(delta)} ${unit}`
        : delta < 0
          ? `▼ ${fmt(Math.abs(delta))} ${unit}`
          : t("no change");

  const head = h("div", { class: "stat-chart-head" }, [
    h("div", { class: "stat-chart-titles" }, [
      h("span", { class: "stat-chart-title", text: title }),
      opts.hint ? h("span", { class: "stat-chart-hint", text: opts.hint }) : null,
    ]),
    h("div", { class: "stat-chart-readout" }, [
      h("span", { class: "stat-chart-now", text: `${fmt(last)} ${unit}`.trim() }),
      h("span", { class: deltaClass, text: deltaText }),
    ]),
  ]);

  const foot = h("div", { class: "stat-chart-foot" }, [
    h("span", { text: labels[0] ?? "" }),
    n > 1 ? h("span", { text: labels[n - 1] ?? "" }) : null,
  ]);

  return h("section", { class: "card stat-chart" }, [head, svg, foot]);
}
