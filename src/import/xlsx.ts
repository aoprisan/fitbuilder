import { dominantTitle, gridToRoutines, ImportError, routinesToSheet, type GridRow } from "./grid";
import type { RoutineSheet } from "../types";

/**
 * Parse an .xlsx/.xls workbook into one routine sheet per worksheet tab.
 * Each tab is read as an array-of-arrays grid and handed to the shared parser;
 * the tab name becomes the sheet name. SheetJS is loaded on demand so it never
 * weighs down the initial app bundle.
 */
export async function parseXlsx(data: ArrayBuffer, baseName: string): Promise<RoutineSheet[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(data, { type: "array" });

  const sheets: RoutineSheet[] = [];
  for (const tabName of wb.SheetNames) {
    const ws = wb.Sheets[tabName];
    if (!ws) continue;

    // header:1 → array-of-arrays; defval:"" keeps column positions stable so the
    // index column stays aligned; raw:false yields display strings ("1", not 1).
    const aoa = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    }) as unknown[][];

    const rows: GridRow[] = aoa.map((row) =>
      Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : [],
    );

    const routines = gridToRoutines(rows);
    if (routines.length === 0) continue;

    const name = tabName.trim() || dominantTitle(routines) || baseName;
    sheets.push(routinesToSheet(name, routines));
  }

  if (sheets.length === 0) {
    throw new ImportError("That spreadsheet didn't contain any recognizable routines.");
  }
  return sheets;
}
