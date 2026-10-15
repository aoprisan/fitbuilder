/**
 * Free-text routine prescriptions ("3×10", "30-50 repetari", "5+5+5 x 5") carried
 * on logged exercises from historic routine runs, read as a total rep target for
 * the live plan benchmark.
 */

/** Read a trailing "x N" multiplier (e.g. " x 5", " x3", " ×3"); defaults to 1. */
function trailingMultiplier(rest: string): number {
  const m = rest.match(/[x×]\s*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

/**
 * Best-effort parse of a free-text prescription into a total rep target.
 * Returns null when the work is timed or round-based (e.g. "20 secunde x 5",
 * "x 3 runde") and therefore carries no countable rep volume.
 *
 * Rules (first match wins), after stripping parenthetical tempo notes:
 *  - "5+5+5 x 5"  → sum of the plus-group × trailing multiplier        → 75
 *  - "3×10-12"    → sets × top-of-range                                → 36
 *  - "1-2-3-2-1"  → pyramid (3+ dash-separated numbers): sum × mult    → 9
 *  - "30-50 …"    → range (exactly 2 dash-separated numbers): the top  → 50
 *  - timed / round-only with no "repet…" keyword                       → null
 *  - "3×10" / "4 x 12" → sets × reps                                   → 30 / 48
 *  - "12, 10, 8"  → comma list of per-set reps: their sum             → 30
 *  - otherwise the first integer is the rep count ("70 repetari" → 70)
 */
export function parseTargetReps(prescription: string): number | null {
  const s = prescription.replace(/\([^)]*\)/g, " ").trim();
  if (s === "") return null;
  const lower = s.toLowerCase();
  const hasReps = lower.includes("repet"); // repetari / repetare

  // "5+5+5 x 5" — additive set blocks, optional ×rounds.
  const plus = s.match(/\d+(?:\s*\+\s*\d+)+/);
  if (plus) {
    const sum = plus[0].split("+").reduce((a, t) => a + Number(t.trim()), 0);
    return sum * trailingMultiplier(s.slice(plus.index! + plus[0].length));
  }

  // "3×10-12" — sets × a per-set rep range. Checked before the bare dash run so
  // the range isn't mistaken for a 2-number range; uses the top of the range.
  const setRange = s.match(/(\d+)\s*[x×]\s*(\d+)\s*-\s*(\d+)/i);
  if (setRange) return Number(setRange[1]) * Math.max(Number(setRange[2]), Number(setRange[3]));

  // Dash runs: a pyramid (3+ numbers) sums; a 2-number range takes its top.
  const dash = s.match(/\d+(?:\s*-\s*\d+)+/);
  if (dash) {
    const parts = dash[0].split("-").map((t) => Number(t.trim()));
    if (parts.length >= 3) {
      const sum = parts.reduce((a, b) => a + b, 0);
      return sum * trailingMultiplier(s.slice(dash.index! + dash[0].length));
    }
    return Math.max(...parts);
  }

  const timed = /\b(sec|secunda|secunde|min|minut|minute)\b/.test(lower);
  const rounds = lower.includes("runde");
  // A bare leading multiplier ("x 3 runde") counts rounds, not reps.
  const leadingRounds = /^x\s*\d/i.test(s);
  if ((timed || rounds || leadingRounds) && !hasReps) return null;

  // "3×10" / "4 x 12" — sets × reps (also how a uniform per-set scheme prints).
  const mult = s.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (mult) return Number(mult[1]) * Number(mult[2]);

  // "12, 10, 8" — a comma list of per-set reps (a varying scheme prints this way).
  const list = s.match(/\d+(?:\s*,\s*\d+)+/);
  if (list) return list[0].split(",").reduce((a, t) => a + Number(t.trim()), 0);

  const nums = s.match(/\d+/g);
  return nums ? Number(nums[0]) : null;
}
