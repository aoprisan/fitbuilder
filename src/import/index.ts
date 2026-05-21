import { ImportError } from "./grid";
import type { RoutineSheet } from "../types";

export { ImportError } from "./grid";

/** A clean, human-friendly base name derived from the uploaded file's name. */
function baseName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  return stem || "Imported";
}

const SPREADSHEET_EXT = new Set(["xlsx", "xls", "xlsm", "xlsb"]);

/**
 * Parse a user-picked file into one or more routine sheets. Dispatches by
 * extension (falling back to MIME type) and lazy-loads the matching parser, so
 * the heavy XLSX/PDF libraries only load when a file of that kind is imported.
 */
export async function importRoutineFile(file: File): Promise<RoutineSheet[]> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const type = file.type.toLowerCase();
  const base = baseName(file.name);
  const data = await file.arrayBuffer();

  if (SPREADSHEET_EXT.has(ext) || type.includes("spreadsheet") || type.includes("excel")) {
    const { parseXlsx } = await import("./xlsx");
    return parseXlsx(data, base);
  }

  if (ext === "pdf" || type === "application/pdf") {
    const { parsePdf } = await import("./pdf");
    return parsePdf(data, base);
  }

  throw new ImportError("Unsupported file. Import an .xlsx, .xls, or .pdf routine sheet.");
}
