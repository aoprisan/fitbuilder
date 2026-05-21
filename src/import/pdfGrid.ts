import type { GridRow } from "./grid";

/** A positioned text run extracted from a PDF page (origin bottom-left). */
export interface TextRun {
  /** Left edge, in PDF points. */
  x: number;
  /** Baseline, in PDF points (grows upward). */
  y: number;
  /** Run width, in points. */
  w: number;
  /** Glyph height, in points. */
  h: number;
  /** The run's text. */
  s: string;
}

/**
 * Cluster positioned text runs back into a grid. Runs are grouped into rows by
 * vertical position, then each row is split into cells wherever a wide
 * horizontal gap marks a column boundary — recovering the table that the PDF
 * only draws visually. Tolerances scale with the page's median glyph height so
 * the same logic copes with different font sizes.
 *
 * Kept free of any pdf.js dependency so it can be unit-tested in isolation.
 */
export function clusterRunsToGrid(runs: TextRun[]): GridRow[] {
  const kept = runs.filter((r) => r.s.trim() !== "");
  if (kept.length === 0) return [];

  const heights = kept
    .map((r) => r.h)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const medianH = heights.length ? (heights[Math.floor(heights.length / 2)] ?? 8) : 8;
  const yTol = Math.max(2, medianH * 0.6); // same row when baselines fall within this
  const colGap = Math.max(8, medianH * 1.2); // new column when the x-gap exceeds this

  // Top-to-bottom (PDF y grows upward), then left-to-right within a line.
  const sorted = [...kept].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextRun[][] = [];
  for (const run of sorted) {
    const line = lines[lines.length - 1];
    const refY = line && line.length ? (line[0]?.y ?? run.y) : null;
    if (line && refY !== null && Math.abs(refY - run.y) <= yTol) line.push(run);
    else lines.push([run]);
  }

  return lines.map((line) => {
    const byX = [...line].sort((a, b) => a.x - b.x);
    const cells: string[] = [];
    let text = "";
    let end = -Infinity;
    for (const run of byX) {
      if (text !== "" && run.x - end > colGap) {
        cells.push(text);
        text = "";
      }
      text = text === "" ? run.s : `${text} ${run.s}`;
      end = run.x + run.w;
    }
    if (text !== "") cells.push(text);
    return cells;
  });
}
