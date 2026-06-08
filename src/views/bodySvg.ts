import { registerTranslations, t } from "../i18n";
import { MUSCLE_LABELS, type MuscleGroup } from "../types";

/**
 * SVG body diagram — the no-WebGL fallback for the Body Map.
 *
 * Two stylised figures (anterior "Front" and posterior "Back") drawn from plain
 * SVG primitives, with one or more regions per muscle group. It mirrors the 3D
 * scene's contract: `colorFor` shades every region and `onPick` fires when a
 * region is tapped, so the view can drive it with the same metric pipeline and
 * readout it uses for the Three.js figure. No external assets — the shapes are
 * authored inline so the diagram works fully offline.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

registerTranslations({
  Front: "Față",
  Back: "Spate",
  "Muscle diagram": "Diagramă musculară",
});

export interface BodySvg {
  /** The <svg> element to mount. */
  el: SVGSVGElement;
  /** Recolour every region from the current `colorFor`. */
  update: () => void;
}

export interface BodySvgOpts {
  /** Fill colour for a muscle's current score (any CSS colour). */
  colorFor: (muscle: MuscleGroup) => string;
  /** Called when a muscle region is tapped. */
  onPick: (muscle: MuscleGroup) => void;
}

type Attrs = Record<string, string | number>;
interface Shape {
  tag: "ellipse" | "rect" | "polygon";
  attrs: Attrs;
}
interface Region {
  muscle: MuscleGroup;
  shapes: Shape[];
}

const ell = (cx: number, cy: number, rx: number, ry: number): Shape => ({
  tag: "ellipse",
  attrs: { cx, cy, rx, ry },
});
const box = (x: number, y: number, w: number, h: number, r: number): Shape => ({
  tag: "rect",
  attrs: { x, y, width: w, height: h, rx: r },
});
const poly = (points: string): Shape => ({ tag: "polygon", attrs: { points } });

// Anterior (front) figure is centred on x=50; the posterior (back) figure is the
// same skeleton shifted +120 in x. Coordinates live in a 224×216 viewBox.
const REGIONS: Region[] = [
  // — front —
  { muscle: "traps", shapes: [poly("36,41 50,30 50,41"), poly("64,41 50,30 50,41")] },
  // Deltoids: the front figure shows the anterior head (inner) with the lateral
  // head as the outer cap; the posterior head is on the back figure.
  { muscle: "front-delts", shapes: [ell(30, 45, 7, 7), ell(70, 45, 7, 7)] },
  { muscle: "side-delts", shapes: [ell(22, 40, 4, 6), ell(78, 40, 4, 6)] },
  { muscle: "chest", shapes: [ell(41, 52, 9, 7), ell(59, 52, 9, 7)] },
  { muscle: "biceps", shapes: [ell(22, 63, 6, 12), ell(78, 63, 6, 12)] },
  { muscle: "forearms", shapes: [ell(18, 87, 5, 13), ell(82, 87, 5, 13)] },
  { muscle: "core", shapes: [box(42, 60, 16, 34, 4)] },
  { muscle: "legs", shapes: [ell(42, 128, 8, 22), ell(58, 128, 8, 22)] },
  { muscle: "calves", shapes: [ell(42, 175, 6, 18), ell(58, 175, 6, 18)] },
  // — back —
  { muscle: "traps", shapes: [poly("150,41 170,30 190,41 170,57")] },
  // Back figure: posterior head (inner) with the lateral head as the outer cap.
  { muscle: "rear-delts", shapes: [ell(150, 45, 7, 7), ell(190, 45, 7, 7)] },
  { muscle: "side-delts", shapes: [ell(142, 40, 4, 6), ell(198, 40, 4, 6)] },
  { muscle: "back", shapes: [ell(158, 68, 8, 13), ell(182, 68, 8, 13)] },
  { muscle: "triceps", shapes: [ell(142, 63, 6, 12), ell(198, 63, 6, 12)] },
  { muscle: "forearms", shapes: [ell(138, 87, 5, 13), ell(202, 87, 5, 13)] },
  { muscle: "lower-back", shapes: [box(162, 80, 16, 14, 3)] },
  { muscle: "glutes", shapes: [ell(162, 104, 9, 9), ell(178, 104, 9, 9)] },
  { muscle: "legs", shapes: [ell(162, 131, 8, 20), ell(178, 131, 8, 20)] },
  { muscle: "calves", shapes: [ell(162, 175, 7, 18), ell(178, 175, 7, 18)] },
];

// Head / neck / hands / knees / feet — drawn for shape, never coloured or tapped.
const INERT: Shape[] = [
  // front
  ell(50, 16, 11, 13),
  box(45, 26, 10, 9, 3),
  ell(16, 103, 4, 4),
  ell(84, 103, 4, 4),
  ell(42, 152, 5, 5),
  ell(58, 152, 5, 5),
  ell(42, 196, 6, 4),
  ell(58, 196, 6, 4),
  // back
  ell(170, 16, 11, 13),
  box(165, 26, 10, 9, 3),
  ell(136, 103, 4, 4),
  ell(204, 103, 4, 4),
  ell(162, 152, 5, 5),
  ell(178, 152, 5, 5),
  ell(162, 196, 7, 4),
  ell(178, 196, 7, 4),
];

function svgEl(tag: string, attrs: Attrs): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function buildBodySvg(opts: BodySvgOpts): BodySvg {
  const svg = svgEl("svg", {
    class: "bodysvg",
    viewBox: "0 0 224 216",
    role: "img",
    "aria-label": t("Muscle diagram"),
  }) as SVGSVGElement;

  // Inert anatomy sits underneath the coloured regions.
  for (const s of INERT) svg.appendChild(svgEl(s.tag, { ...s.attrs, class: "bodysvg-inert" }));

  // Regions, grouped by muscle so a tap or recolour hits every shape at once.
  const byMuscle = new Map<MuscleGroup, SVGElement[]>();
  for (const region of REGIONS) {
    const list = byMuscle.get(region.muscle) ?? [];
    for (const s of region.shapes) {
      const node = svgEl(s.tag, { ...s.attrs, class: "bodysvg-region" });
      const title = svgEl("title", {});
      title.textContent = t(MUSCLE_LABELS[region.muscle]);
      node.appendChild(title);
      node.addEventListener("click", () => opts.onPick(region.muscle));
      svg.appendChild(node);
      list.push(node);
    }
    byMuscle.set(region.muscle, list);
  }

  // Front / back captions.
  for (const [x, label] of [[50, t("Front")], [170, t("Back")]] as const) {
    const text = svgEl("text", { x, y: 212, class: "bodysvg-label" });
    text.textContent = label;
    svg.appendChild(text);
  }

  return {
    el: svg,
    update: () => {
      for (const [muscle, nodes] of byMuscle) {
        const fill = opts.colorFor(muscle);
        for (const node of nodes) node.setAttribute("fill", fill);
      }
    },
  };
}
