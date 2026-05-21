import { dominantTitle, gridToRoutines, ImportError, routinesToSheet, type GridRow } from "./grid";
import { clusterRunsToGrid, type TextRun } from "./pdfGrid";
import type { RoutineSheet } from "../types";
// Vite emits the worker as a hashed asset and gives us its URL. pdf.js spawns
// the worker from this URL on demand, so it isn't fetched until a PDF is parsed.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Parse a text PDF into a single routine sheet. pdf.js is loaded on demand.
 *
 * Each page is clustered into rows separately (page coordinates aren't
 * comparable across pages), then the rows are concatenated in reading order and
 * parsed as one document. That matters because a routine's header can sit at the
 * foot of one page while its exercises flow onto the next — parsing per page
 * would orphan them. A PDF that yields no routines (e.g. a scan of images rather
 * than text) raises an ImportError.
 */
export async function parsePdf(data: ArrayBuffer, baseName: string): Promise<RoutineSheet[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;

  const rows: GridRow[] = [];
  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      try {
        const content = await page.getTextContent();
        const runs: TextRun[] = [];
        for (const item of content.items) {
          if (!("str" in item) || !("transform" in item)) continue;
          const t = item.transform;
          runs.push({ x: t[4] ?? 0, y: t[5] ?? 0, w: item.width ?? 0, h: item.height ?? 0, s: item.str });
        }
        rows.push(...clusterRunsToGrid(runs));
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await doc.destroy();
  }

  const routines = gridToRoutines(rows);
  if (routines.length === 0) {
    throw new ImportError("Couldn't find routines in that PDF — it may be scanned images rather than text.");
  }
  return [routinesToSheet(dominantTitle(routines) ?? baseName, routines)];
}
