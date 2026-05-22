import { h } from "../dom";
import { round2 } from "../util";

const SVG_NS = "http://www.w3.org/2000/svg";
const DIAL_R = 52;
const DIAL_C = 2 * Math.PI * DIAL_R;
/** Steps applied per full revolution while dragging the knob. */
const STEPS_PER_TURN = 24;
const RAD_PER_STEP = (2 * Math.PI) / STEPS_PER_TURN;
/** Steps that fill one full ring band before the gauge rescales. */
const RING_STEPS = 40;

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export interface DialFieldOpts {
  label: string;
  value: number;
  step: number;
  min: number;
  integer: boolean;
  /** Short readout shown under the number, e.g. "kg" or "reps". */
  unit: string;
  tone?: "signal" | "navy";
  onCommit: (value: number) => void;
}

/**
 * A circular gauge that doubles as an input: drag around the ring like a knob,
 * tap −/＋ for single steps, or type straight into the centre. Built to match
 * the rest-timer dial's pressure-gauge look.
 */
export function dialField(opts: DialFieldOpts): HTMLElement {
  const { label, step, min, integer, unit, onCommit } = opts;
  let current = opts.value;

  const fill = svgEl("circle", {
    class: opts.tone === "navy" ? "input-dial-fill tone-navy" : "input-dial-fill",
    cx: "60",
    cy: "60",
    r: String(DIAL_R),
    "stroke-dasharray": String(DIAL_C),
    "stroke-dashoffset": "0",
  });
  const svg = svgEl("svg", {
    class: "input-dial",
    viewBox: "0 0 120 120",
    "aria-hidden": "true",
  });
  svg.appendChild(
    svgEl("circle", { class: "input-dial-track", cx: "60", cy: "60", r: String(DIAL_R) }),
  );
  svg.appendChild(fill);

  const input = h("input", {
    class: "dial-input-num",
    type: "text",
    inputmode: integer ? "numeric" : "decimal",
    value: String(current),
    aria: { label },
  });

  const center = h("div", { class: "dial-input-center" }, [
    input,
    h("span", { class: "dial-input-unit", text: unit }),
  ]);

  const valueText = (): string => `${current} ${unit}`.trim();

  const knob = h(
    "div",
    {
      class: "dial-knob",
      role: "slider",
      tabindex: "0",
      aria: { label, valuemin: String(min), valuenow: String(current), valuetext: valueText() },
    },
    [svg, center],
  );

  const fracFor = (v: number): number => {
    const above = v - min;
    if (above <= 0) return 0;
    const ringSpan = step * RING_STEPS;
    const softMax = ringSpan * Math.max(1, Math.ceil(above / ringSpan));
    return Math.min(1, above / softMax);
  };

  const paint = (): void => {
    fill.setAttribute("stroke-dashoffset", String(DIAL_C * (1 - fracFor(current))));
    knob.setAttribute("aria-valuenow", String(current));
    knob.setAttribute("aria-valuetext", valueText());
  };

  const normalize = (n: number): number => round2(integer ? Math.round(n) : n);

  const setValue = (n: number, reflect: boolean): void => {
    const next = Math.max(min, normalize(n));
    if (reflect) input.value = String(next);
    if (next === current) return;
    current = next;
    paint();
    onCommit(current);
  };

  input.addEventListener("input", () => {
    const n = parseFloat(input.value);
    if (Number.isFinite(n)) setValue(n, false);
  });
  input.addEventListener("change", () => {
    const n = parseFloat(input.value);
    setValue(Number.isFinite(n) ? n : min, true);
  });
  input.addEventListener("focus", () => input.select());

  // ── Knob drag (pointer = mouse + touch + pen) ──────────────────────────────
  const centerPoint = (): { x: number; y: number } => {
    const r = knob.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const angleAt = (e: PointerEvent): number => {
    const c = centerPoint();
    return Math.atan2(e.clientY - c.y, e.clientX - c.x);
  };

  let dragging = false;
  let lastAngle = 0;
  let accum = 0;
  let dragStart = 0;

  knob.addEventListener("pointerdown", (e: PointerEvent) => {
    // Let taps that land on the number focus it for typing instead of dragging.
    if (input.contains(e.target as Node)) return;
    dragging = true;
    dragStart = current;
    accum = 0;
    lastAngle = angleAt(e);
    knob.classList.add("is-dragging");
    knob.setPointerCapture(e.pointerId);
  });
  knob.addEventListener("pointermove", (e: PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const a = angleAt(e);
    let d = a - lastAngle;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    lastAngle = a;
    accum += d;
    setValue(dragStart + Math.round(accum / RAD_PER_STEP) * step, true);
  });
  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    knob.classList.remove("is-dragging");
    if (knob.hasPointerCapture(e.pointerId)) knob.releasePointerCapture(e.pointerId);
  };
  knob.addEventListener("pointerup", endDrag);
  knob.addEventListener("pointercancel", endDrag);

  knob.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.target === input) return; // typing in the centre owns the arrows
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      setValue(current + step, true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      setValue(current - step, true);
    }
  });

  const dec = h("button", {
    class: "stepper",
    type: "button",
    text: "−",
    aria: { label: `decrease ${label}` },
    on: { click: () => setValue(current - step, true) },
  });
  const inc = h("button", {
    class: "stepper",
    type: "button",
    text: "+",
    aria: { label: `increase ${label}` },
    on: { click: () => setValue(current + step, true) },
  });

  paint();

  return h("div", { class: "field dial-field" }, [
    h("span", { class: "field-label", text: label }),
    knob,
    h("div", { class: "dial-input-foot" }, [dec, inc]),
  ]);
}
