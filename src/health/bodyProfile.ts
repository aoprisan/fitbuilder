import { latestBodyweight, logBodyweight } from "../bodyweightStore";

/**
 * The measures shared by every view: height and build live here
 * (`gymlog.body`), weight is the newest entry of the body-weight log
 * (`gymlog.bodyweight`) — the same series the Fuel weigh-ins write and the
 * protein / calorie heuristics read. Blood alcohol (Widmark) needs all three;
 * waist-to-height needs the height.
 */

export type Sex = "female" | "male" | "unspecified";

export interface Body {
  heightCm: number | null;
  weightKg: number | null;
  sex: Sex;
}

const KEY = "gymlog.body";

export const HEIGHT_RANGE = [50, 260] as const;
export const WEIGHT_RANGE = [20, 400] as const;

function coerceMeasure(v: unknown, [min, max]: readonly [number, number]): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return null;
  return Math.round(v * 10) / 10;
}

function coerceSex(v: unknown): Sex {
  return v === "male" || v === "female" ? v : "unspecified";
}

interface Profile {
  heightCm: number | null;
  sex: Sex;
}

function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { heightCm: null, sex: "unspecified" };
    const r = JSON.parse(raw) as Record<string, unknown>;
    return { heightCm: coerceMeasure(r["heightCm"], HEIGHT_RANGE), sex: coerceSex(r["sex"]) };
  } catch {
    return { heightCm: null, sex: "unspecified" };
  }
}

function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Quota or privacy mode — the measures just won't persist.
  }
}

/** Height, build and the latest logged body weight. */
export function loadBody(): Body {
  const p = loadProfile();
  return { ...p, weightKg: latestBodyweight()?.kg ?? null };
}

/**
 * Update the measures. A weight different from the latest logged one is
 * logged for today, so it joins the body-weight series everything else reads.
 */
export function saveBody(patch: Partial<Body>): void {
  const p = loadProfile();
  if (patch.heightCm !== undefined) p.heightCm = coerceMeasure(patch.heightCm, HEIGHT_RANGE);
  if (patch.sex !== undefined) p.sex = coerceSex(patch.sex);
  saveProfile(p);
  const w = patch.weightKg === undefined ? null : coerceMeasure(patch.weightKg, WEIGHT_RANGE);
  if (w !== null && w !== latestBodyweight()?.kg) logBodyweight(w);
}
