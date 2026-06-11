import { loadIncrementKg } from "./overload";
import { BAR_KG } from "./plates";
import { isBodyweight, isCardio, type Equipment } from "./types";
import { round2 } from "./util";

/**
 * Warm-up ramp — the classic ascending prep for a loaded movement: a few
 * progressively heavier, low-rep sets that groove the pattern without eating
 * into the working sets' tank. Percentages of the day's working weight, rounded
 * to the gear's practical increment.
 */

export interface WarmupStep {
  /** Fraction of the working weight this step targets (e.g. 0.4). */
  pct: number;
  reps: number;
  /** Step load rounded to the gear's increment (never below the empty bar). */
  weightKg: number;
}

/** Light → heavy prep: high-rep groove first, then sparse heavier singles-ish triples. */
const RAMP: ReadonlyArray<{ pct: number; reps: number }> = [
  { pct: 0.4, reps: 8 },
  { pct: 0.6, reps: 5 },
  { pct: 0.8, reps: 3 },
];

/**
 * Ramp steps up to (never reaching) a working weight. Empty when a ramp makes
 * no sense: cardio bouts, bodyweight gear, or a load too light to subdivide
 * into meaningfully distinct steps.
 */
export function warmupRamp(workingKg: number, equipment: Equipment): WarmupStep[] {
  if (isCardio(equipment) || isBodyweight(equipment) || workingKg <= 0) return [];
  const inc = loadIncrementKg(equipment);
  const floor = equipment === "barbell" ? BAR_KG : inc;
  const out: WarmupStep[] = [];
  for (const step of RAMP) {
    let kg = Math.round((workingKg * step.pct) / inc) * inc;
    if (kg < floor) kg = floor;
    if (kg >= workingKg) continue; // step would match/exceed the work weight — pointless
    if (out.length > 0 && kg <= out[out.length - 1]!.weightKg) continue; // collapsed into the previous step
    out.push({ pct: step.pct, reps: step.reps, weightKg: round2(kg) });
  }
  return out;
}
