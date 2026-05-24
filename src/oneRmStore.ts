import { round2 } from "./util";

/**
 * Tested one-rep maxes the user has logged for themselves — typically hit at the
 * gym outside a tracked workout. Kept in their own store (not on a session's
 * exercise) so a max can be recorded without running a Live session. Keyed by
 * the same {@link ExerciseKey} Stats uses (a catalog movement id, else the
 * legacy "muscle::equipment" pairing) so a logged max lines up with that
 * exercise's progress history.
 */
export type OneRmMaxes = Record<string, number>;

const KEY = "gymlog.oneRm";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Load every logged tested max, dropping any malformed or non-positive entries. */
export function loadOneRmMaxes(): OneRmMaxes {
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return {};
  }
  if (text === null) return {};

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (!isRecord(raw)) return {};

  const out: OneRmMaxes = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[key] = round2(value);
  }
  return out;
}

function writeAll(maxes: OneRmMaxes): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(maxes));
  } catch {
    // Quota or privacy-mode failure: the max just won't persist.
  }
}

/** Record (or update) the tested max for an exercise key; a non-positive value clears it. */
export function setOneRm(key: string, kg: number): void {
  const maxes = loadOneRmMaxes();
  if (Number.isFinite(kg) && kg > 0) maxes[key] = round2(kg);
  else delete maxes[key];
  writeAll(maxes);
}

/** Forget the tested max for an exercise key. */
export function clearOneRm(key: string): void {
  const maxes = loadOneRmMaxes();
  if (key in maxes) {
    delete maxes[key];
    writeAll(maxes);
  }
}
