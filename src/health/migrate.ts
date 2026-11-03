import { loadBodyweights, logBodyweight } from "../bodyweightStore";

/**
 * One-time import from the standalone health journal. Both apps are served
 * from the same origin (aoprisan.github.io), so its localStorage is readable
 * here: drinks + goal (`health:v1`), the cut (`health:cut:v1`, or the older
 * standalone tracker's `cut-tracker.v1`) and the body measures. The originals
 * are left untouched; a flag makes sure this runs once per device.
 *
 * Writes the raw shapes straight into the gymlog.* keys — each store coerces
 * on load, so nothing here needs to validate beyond "is it JSON".
 */

const FLAG = "gymlog.healthImported";
const WATER_KEY = "gymlog.water";
const CUT_KEY = "gymlog.cut";
const BODY_KEY = "gymlog.body";

function read(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function has(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return true; // storage blocked: behave as if there is nothing to do
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota — the import is best effort.
  }
}

let done = false;

export function migrateHealthApp(): void {
  if (done) return;
  done = true;
  if (has(FLAG)) return;

  const water = read("health:v1");
  const cut = read("health:cut:v1") ?? read("cut-tracker.v1");
  const settings = (water?.["settings"] ?? {}) as Record<string, unknown>;
  const body = (settings["body"] ?? {}) as Record<string, unknown>;

  if (water && !has(WATER_KEY)) {
    write(WATER_KEY, { entries: water["entries"] ?? [], dailyGoalMl: settings["dailyGoalMl"] });
  }

  const weights = (cut?.["weights"] ?? {}) as Record<string, unknown>;
  if (cut && !has(CUT_KEY)) {
    const rest = { ...cut };
    delete rest["weights"];
    write(CUT_KEY, rest);
  }
  // Weigh-ins join the shared body-weight log; days already logged here win.
  const logged = new Set(loadBodyweights().map((e) => e.date));
  for (const [day, kg] of Object.entries(weights)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof kg === "number" && kg > 0 && !logged.has(day)) {
      logBodyweight(kg, day);
    }
  }
  const weightKg = body["weightKg"];
  if (typeof weightKg === "number" && weightKg > 0 && loadBodyweights().length === 0) {
    logBodyweight(weightKg);
  }

  if (!has(BODY_KEY)) {
    const cutSettings = (cut?.["settings"] ?? {}) as Record<string, unknown>;
    const heightCm = body["heightCm"] ?? cutSettings["height"] ?? null;
    if (heightCm !== null || body["sex"] !== undefined) {
      write(BODY_KEY, { heightCm, sex: body["sex"] ?? "unspecified" });
    }
  }

  write(FLAG, { at: new Date().toISOString(), water: !!water, cut: !!cut });
}
