import { clear, h } from "../dom";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  "{0}, page {1} of {2}": "{0}, pagina {1} din {2}",
  "next page of {0}": "pagina următoare pentru {0}",
});

/* =============================================================================
   Radial selector — concentric picker rings around a hub.

   A dial-shaped alternative to the stacked chip lists: every ring is one axis of
   the choice (muscle group → its exercises → the quick picks the user actually
   trains), drawn as wedges around a hub that carries the current selection and
   the action button. Nothing scrolls, so the whole picker stays under the thumb
   on a phone — that's the point of the shape.

   Rings are given outermost-first. A ring longer than its wedge budget pages
   through a pager wedge in its last slot rather than shrinking its labels into
   illegibility; the page holding the active item is the one shown on mount.

   Drawn as one SVG (view box {@link VIEW}², CSS scales it to the container) with
   the hub as a real HTML button overlaid at the centre, so the hub wraps text and
   focuses like every other button in the app.
   ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";

/** View-box size; the centre is at (C, C) and CSS scales the whole thing. */
const VIEW = 300;
const C = VIEW / 2;
/** Outer edge of the outermost ring, and the radius of the hub inside them all. */
const R_OUT = 147;
const HUB_R = 44;
/** Blank stock between two rings, and between the innermost ring and the hub. */
const RING_GAP = 3;
/** Gap cut between neighbouring wedges, in view units at the label radius. */
const WEDGE_GAP = 2.6;

/** Unique ids for the per-wedge label arcs (`textPath` needs a real reference). */
let uid = 0;

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Cartesian point at `r` from the centre, angle 0 at 12 o'clock, clockwise. */
function polar(r: number, angle: number): readonly [number, number] {
  return [C + r * Math.sin(angle), C - r * Math.cos(angle)];
}

/** Annular sector (a ring wedge) from `a0` to `a1`, spanning `rIn`…`rOut`. */
function wedgePath(rIn: number, rOut: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(rOut, a0);
  const [x1, y1] = polar(rOut, a1);
  const [x2, y2] = polar(rIn, a1);
  const [x3, y3] = polar(rIn, a0);
  return (
    `M${x0} ${y0}A${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1}` +
    `L${x2} ${y2}A${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3}Z`
  );
}

/** Bare arc used as a label baseline; `flip` runs it counter-clockwise. */
function arcPath(r: number, a0: number, a1: number, flip: boolean): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [xa, ya] = polar(r, flip ? a1 : a0);
  const [xb, yb] = polar(r, flip ? a0 : a1);
  return `M${xa} ${ya}A${r} ${r} 0 ${large} ${flip ? 0 : 1} ${xb} ${yb}`;
}

/**
 * First guess at how much of a label fits along `arcLen`: the mono face bundled
 * with the app advances ~0.64em per character, plus its letter-spacing. Refined
 * against the real glyph widths by {@link fitDrawnLabels} once the wedges are in
 * the document — this only has to be close enough to avoid a visible reflow.
 */
function estimateLabel(label: string, arcLen: number, fontSize: number): string {
  const max = Math.floor(arcLen / (fontSize * 0.68));
  if (max < 2) return "·";
  return label.length <= max ? label : `${label.slice(0, max - 1).trimEnd()}…`;
}

export interface RadialItem {
  id: string;
  label: string;
  /** Status ink for the band at the wedge's outer edge (e.g. recovery colour). */
  tint?: string;
}

export interface RadialRing {
  /** What this ring picks — its group label, legend caption and aria text. */
  label: string;
  items: readonly RadialItem[];
  /** Id of the picked item; "" when this ring has no selection. */
  activeId: string;
  onPick: (id: string) => void;
  /** Wedges drawn at once; a longer list pages (default 10). */
  capacity?: number;
  /** Relative band thickness against the other rings (default 1). */
  weight?: number;
  /** Ink class suffix — `radial-ring-<tone>` styles the ring's wedges. */
  tone?: string;
}

export interface RadialHub {
  /** Headline in the hub — normally the picked exercise. */
  title: string;
  /** Small line above the title (muscle group, gear…). */
  sub: string;
  /** Turns the hub into the confirm button; null leaves it a readout. */
  action: { label: string; onClick: () => void } | null;
}

export interface RadialSelectorOpts {
  /** Outermost ring first. Empty rings are dropped. */
  rings: readonly RadialRing[];
  hub: RadialHub;
}

/**
 * Build the concentric picker. Picking calls the ring's `onPick` (the caller
 * re-renders); paging repaints in place, so the widget owns nothing but which
 * page each ring is showing.
 */
export function radialSelector(opts: RadialSelectorOpts): HTMLElement {
  const rings = opts.rings.filter((r) => r.items.length > 0);

  const svg = svgEl("svg", {
    class: "radial-svg",
    viewBox: `0 0 ${VIEW} ${VIEW}`,
    role: "group",
    "aria-label": rings.map((r) => r.label).join(" · "),
  });

  // Band thickness per ring, split by weight over what the hub and gaps leave.
  const weights = rings.map((r) => r.weight ?? 1);
  const totalWeight = weights.reduce((a, w) => a + w, 0) || 1;
  const free = R_OUT - HUB_R - RING_GAP * rings.length;
  const bands = weights.map((w) => (free * w) / totalWeight);

  /** Wedges per page for a ring — one slot goes to the pager when it pages. */
  const slotsOf = (ring: RadialRing): { slots: number; perPage: number; pages: number } => {
    const cap = Math.max(3, ring.capacity ?? 10);
    if (ring.items.length <= cap) {
      return { slots: ring.items.length, perPage: ring.items.length, pages: 1 };
    }
    const perPage = cap - 1;
    return { slots: cap, perPage, pages: Math.ceil(ring.items.length / perPage) };
  };

  // Open each ring on the page carrying its selection, so the picked item is
  // visible without paging to find it.
  const pageOf = rings.map((ring) => {
    const { perPage } = slotsOf(ring);
    const at = ring.items.findIndex((it) => it.id === ring.activeId);
    return at < 0 ? 0 : Math.floor(at / perPage);
  });

  /** Labels drawn this pass, awaiting the measured fit-up in {@link fitDrawnLabels}. */
  const drawn: { text: SVGElement; textPath: SVGElement; label: string; arcLen: number }[] = [];

  const hubSub = h("span", { class: "radial-hub-sub", text: opts.hub.sub });
  const hubTitle = h("span", { class: "radial-hub-title", text: opts.hub.title });
  const hubAction = h("span", {
    class: "radial-hub-action",
    text: opts.hub.action ? opts.hub.action.label : "",
  });
  const hub = h(
    "button",
    {
      class: "radial-hub",
      type: "button",
      disabled: opts.hub.action === null,
      aria: {
        label: opts.hub.action
          ? `${opts.hub.action.label} — ${opts.hub.title}`
          : opts.hub.title,
      },
      on: { click: () => opts.hub.action?.onClick() },
    },
    [hubSub, hubTitle, hubAction],
  );

  // Hovering or focusing a wedge previews its full name in the hub — the labels
  // on the rings are trimmed to their arc, so this is where a long one is read.
  const preview = (label: string | null): void => {
    hubTitle.textContent = label ?? opts.hub.title;
    hub.classList.toggle("is-previewing", label !== null);
  };

  function drawWedge(
    ring: RadialRing,
    ringIndex: number,
    host: SVGElement,
    rIn: number,
    rOut: number,
    a0: number,
    a1: number,
    item: RadialItem | null,
    pager: { page: number; pages: number } | null,
  ): void {
    const rMid = (rIn + rOut) / 2;
    const gap = WEDGE_GAP / rMid;
    const s0 = a0 + gap;
    const s1 = a1 - gap;
    const face = svgEl("path", { class: "radial-seg-face", d: wedgePath(rIn, rOut, s0, s1) });

    if (item === null && pager === null) {
      // A slot the last page doesn't fill — blank stock, keeps the ring round.
      const blank = svgEl("g", { class: "radial-seg is-blank" });
      blank.appendChild(face);
      host.appendChild(blank);
      return;
    }

    const active = item !== null && item.id === ring.activeId;
    const label = item ? item.label : `${pager!.page + 1}/${pager!.pages} ›`;
    const g = svgEl("g", {
      class: `radial-seg${active ? " is-active" : ""}${pager ? " is-pager" : ""}`,
      role: "button",
      tabindex: "0",
      "aria-label": item
        ? `${ring.label}: ${item.label}`
        : t("next page of {0}").replace("{0}", ring.label),
      ...(item ? { "aria-pressed": String(active) } : {}),
    });
    g.appendChild(face);

    if (item?.tint !== undefined) {
      const band = svgEl("path", {
        class: "radial-seg-tint",
        d: wedgePath(rOut - 4.5, rOut, s0, s1),
      });
      band.setAttribute("fill", item.tint);
      g.appendChild(band);
    }

    // Label size follows the band, but an inner ring's arc is short as well as
    // thin — so the radius caps it too, or the innermost labels trim to nothing.
    const fs = Math.max(7, Math.min(10.5, (rOut - rIn) * 0.34, rMid * 0.13));
    // Wedges on the lower half read upside down along a clockwise arc, so their
    // baseline is drawn the other way round (and sits just outside centre-band).
    const mid = (s0 + s1) / 2;
    const flip = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
    const rText = rMid + (flip ? fs * 0.34 : -fs * 0.34);
    const pathId = `radial-arc-${++uid}`;
    const arc = svgEl("path", { id: pathId, d: arcPath(rText, s0, s1, flip), fill: "none" });
    g.appendChild(arc);

    // Centred on the arc: without an anchor the label starts at the mid-point
    // and SVG drops every glyph that runs off the end of the path.
    const text = svgEl("text", {
      class: "radial-seg-label",
      "font-size": String(fs),
      "text-anchor": "middle",
    });
    const textPath = svgEl("textPath", { startOffset: "50%" });
    textPath.setAttribute("href", `#${pathId}`);
    const arcLen = (s1 - s0) * rText;
    textPath.textContent = estimateLabel(label, arcLen, fs);
    text.appendChild(textPath);
    g.appendChild(text);
    drawn.push({ text, textPath, label, arcLen });

    const activate = (): void => {
      if (item) {
        preview(null);
        ring.onPick(item.id);
      } else {
        pageOf[ringIndex] = (pager!.page + 1) % pager!.pages;
        paint();
      }
    };
    g.addEventListener("click", activate);
    g.addEventListener("keydown", (ev) => {
      const key = (ev as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
      ev.preventDefault();
      activate();
    });
    if (item) {
      // Mouse and keyboard only: a tap would leave the hub stuck on the preview,
      // since the wedge is replaced by the re-render before its pointerleave.
      g.addEventListener("pointerenter", (ev) => {
        if ((ev as PointerEvent).pointerType === "mouse") preview(item.label);
      });
      g.addEventListener("pointerleave", (ev) => {
        if ((ev as PointerEvent).pointerType === "mouse") preview(null);
      });
      g.addEventListener("focus", () => preview(item.label));
      g.addEventListener("blur", () => preview(null));
    }
    host.appendChild(g);
  }

  /**
   * Second pass over the labels, once they are in the document and measurable:
   * grow each back to its full name if the glyphs really do fit, and otherwise
   * trim it down until they do. Estimating from the font metrics alone misjudges
   * a translated label or a fallback face, and an overlong `textPath` label is
   * silently cut off mid-word rather than wrapped.
   */
  function fitDrawnLabels(): void {
    for (const item of drawn) {
      const el = item.text as SVGTextContentElement;
      // A detached or hidden wedge measures 0 — leave the estimate in place.
      if (el.getComputedTextLength() === 0) continue;
      item.textPath.textContent = item.label;
      let len = el.getComputedTextLength();
      let text = item.label;
      while (len > item.arcLen && text.length > 1) {
        const keep = Math.max(1, Math.min(text.length - 1, Math.floor(text.length * (item.arcLen / len))));
        text = text.slice(0, keep).trimEnd();
        item.textPath.textContent = `${text}…`;
        len = el.getComputedTextLength();
      }
    }
    drawn.length = 0;
  }

  function paint(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    drawn.length = 0;
    let rOut = R_OUT;
    rings.forEach((ring, i) => {
      const rIn = rOut - (bands[i] ?? 0);
      const ringG = svgEl("g", { class: `radial-ring radial-ring-${ring.tone ?? "plain"}` });
      svg.appendChild(ringG);
      const { slots, perPage, pages } = slotsOf(ring);
      const page = Math.min(pageOf[i] ?? 0, pages - 1);
      const shown = ring.items.slice(page * perPage, page * perPage + perPage);
      const step = (2 * Math.PI) / Math.max(1, slots);
      for (let k = 0; k < slots; k++) {
        const a0 = -step / 2 + k * step;
        const isPager = pages > 1 && k === slots - 1;
        drawWedge(
          ring,
          i,
          ringG,
          rIn,
          rOut,
          a0,
          a0 + step,
          isPager ? null : (shown[k] ?? null),
          isPager ? { page, pages } : null,
        );
      }
      rOut = rIn - RING_GAP;
    });
    paintLegend();
    // Wedges are measurable only once the caller has mounted them.
    requestAnimationFrame(fitDrawnLabels);
  }

  // Legend doubles as the page readout, so it is repainted with the rings.
  const legend = h("div", { class: "radial-legend" });

  function paintLegend(): void {
    clear(legend);
    rings.forEach((ring, i) => {
      const { pages } = slotsOf(ring);
      const page = Math.min(pageOf[i] ?? 0, pages - 1);
      legend.append(
        h("span", { class: `radial-legend-item radial-ring-${ring.tone ?? "plain"}` }, [
          h("span", { class: "radial-legend-swatch", aria: { hidden: "true" } }),
          h("span", {
            text:
              pages > 1
                ? t("{0}, page {1} of {2}")
                    .replace("{0}", ring.label)
                    .replace("{1}", String(page + 1))
                    .replace("{2}", String(pages))
                : ring.label,
          }),
        ]),
      );
    });
  }

  paint();

  return h("div", { class: "radial-picker" }, [
    h("div", { class: "radial-dial" }, [svg, hub]),
    legend,
  ]);
}
