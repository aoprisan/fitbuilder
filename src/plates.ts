import { round2 } from "./util";

/**
 * Barbell plate math — what to load per side for a target total. Standard
 * Olympic bar and the common metric plate set; greedy loading is exact for this
 * denomination set whenever the remainder per side is a multiple of 1.25 kg.
 */

export const BAR_KG = 20;
const PLATES_KG: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25];

export interface PlateLoad {
  /** Plates per side, heaviest first, e.g. [20, 5, 2.5]. */
  perSide: number[];
  /** Weight per side that can't be made with standard plates (0 when exact). */
  remainderKg: number;
}

/**
 * Plates per side for a total bar weight. Null when the target is below the
 * empty bar — nothing to load.
 */
export function platesPerSide(totalKg: number, barKg: number = BAR_KG): PlateLoad | null {
  if (totalKg < barKg) return null;
  let side = (totalKg - barKg) / 2;
  const perSide: number[] = [];
  for (const p of PLATES_KG) {
    while (side >= p - 1e-9) {
      perSide.push(p);
      side -= p;
    }
  }
  return { perSide, remainderKg: round2(side) };
}
