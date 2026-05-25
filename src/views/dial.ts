import { h } from "../dom";
import { round2 } from "../util";

const SVG_NS = "http://www.w3.org/2000/svg";
// Tucked in to make room for the chunkier ring stroke without colliding with
// the gauge tick marks just outside it.
const DIAL_R = 45;
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
 * A circular gauge that doubles as an input: grab anywhere on the face and spin
 * it like a joystick, tap −/＋ for single steps, or tap the centre to type. Built
 * to match the rest-timer dial's pressure-gauge look.
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

  // A grip that sweeps the whole face: it sticks to the finger while dragging
  // (so the dial visibly turns under your touch), and rests at the fill edge.
  const rotor = svgEl("g", { class: "dial-rotor" });
  rotor.appendChild(
    svgEl("line", { class: "dial-needle", x1: "60", y1: "60", x2: "60", y2: "26" }),
  );
  rotor.appendChild(
    svgEl("circle", {
      class: opts.tone === "navy" ? "dial-thumb tone-navy" : "dial-thumb",
      cx: "60",
      cy: String(60 - DIAL_R),
      r: "8",
    }),
  );
  svg.appendChild(rotor);

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

  // Drag state lives up here so paint() can park the grip when idle.
  let mode: "idle" | "armed" | "drag" = "idle";

  // Rotate the grip group around the dial centre (degrees, clockwise from top).
  const setSpin = (deg: number): void => {
    rotor.setAttribute("transform", `rotate(${deg.toFixed(2)} 60 60)`);
  };

  const paint = (): void => {
    fill.setAttribute("stroke-dashoffset", String(DIAL_C * (1 - fracFor(current))));
    if (mode !== "drag") setSpin(fracFor(current) * 360);
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

  // The whole face is grabbable. We arm on press but only commit to a spin once
  // the pointer travels past a small threshold; a press that never moves is a
  // tap, which focuses the centre number for typing. This lets you spin from
  // anywhere — including over the number — without losing tap-to-type.
  const DRAG_THRESHOLD_SQ = 6 * 6;
  let lastAngle = 0;
  let accum = 0;
  let dragStart = 0;
  let startX = 0;
  let startY = 0;
  let pressedCenter = false;

  knob.addEventListener("pointerdown", (e: PointerEvent) => {
    mode = "armed";
    dragStart = current;
    accum = 0;
    startX = e.clientX;
    startY = e.clientY;
    lastAngle = angleAt(e);
    pressedCenter = center.contains(e.target as Node);
    knob.setPointerCapture(e.pointerId);
    // Suppress the native focus/selection so a press can become a spin without
    // popping the keyboard; taps focus the input explicitly on pointerup.
    e.preventDefault();
  });
  knob.addEventListener("pointermove", (e: PointerEvent) => {
    if (mode === "idle") return;
    if (mode === "armed") {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
      mode = "drag";
      knob.classList.add("is-dragging");
      if (document.activeElement === input) input.blur();
      // Re-anchor the angle where the spin actually begins so the first step
      // isn't a jump from a near-centre press point.
      lastAngle = angleAt(e);
    }
    e.preventDefault();
    const a = angleAt(e);
    // Glue the grip to the finger (top of the dial is −90°, so +90° aligns it).
    setSpin((a * 180) / Math.PI + 90);
    let d = a - lastAngle;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    lastAngle = a;
    accum += d;
    setValue(dragStart + Math.round(accum / RAD_PER_STEP) * step, true);
  });
  const endDrag = (e: PointerEvent, tap: boolean): void => {
    if (mode === "idle") return;
    const wasTap = mode === "armed";
    mode = "idle";
    knob.classList.remove("is-dragging");
    if (knob.hasPointerCapture(e.pointerId)) knob.releasePointerCapture(e.pointerId);
    // Settle the grip back to the value's resting position.
    paint();
    if (tap && wasTap && pressedCenter) input.focus();
  };
  knob.addEventListener("pointerup", (e: PointerEvent) => endDrag(e, true));
  knob.addEventListener("pointercancel", (e: PointerEvent) => endDrag(e, false));

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
