/**
 * Hand a supplement label (photo and/or a description) to Claude and read the
 * products back as stack items. Same share/paste contract as the meal
 * estimate in `cutClaude.ts` — no API, no key.
 */
import { ERR_EMPTY, parseMenuReply, parsedCandidates, parseRecipeReply, pick, toNum } from "./cutClaude";
import {
  clampPerDay,
  formatDose,
  isKind,
  SUPP_KINDS,
  type Supplement,
  type SuppKind,
  type SuppUnit,
} from "./suppStore";

/** One product from Claude's read, ready to join (or update) the stack. */
export interface SuppEstimate {
  name: string;
  kind: SuppKind;
  dose: number;
  unit: SuppUnit;
  perDay: number;
  note: string | null;
}

export const ERR_NO_SUPPS =
  'No supplement found — the reply needs the JSON block with "supplements", each with name, dose and unit.';

export function buildSuppPrompt(description: string, stack: readonly Supplement[], withPhoto: boolean): string {
  const what = description.trim();
  const lines = [
    withPhoto
      ? "Read the supplement label in this photo and turn it into an entry for my supplement log."
      : "Turn this supplement into an entry for my supplement log.",
  ];
  if (what) lines.push(`About it: ${what}`);
  lines.push(
    "",
    "One entry per product — a multivitamin or a blend is one entry dosed in tablets or capsules, not one per ingredient.",
    "dose is the amount per serving as I take it, with unit one of: g, mg, µg, IU, caps, tab, ml (convert mcg to µg; a scoop of powder to g).",
    "perDay is servings per day as the label directs, unless I said otherwise above.",
    `kind is one of: ${SUPP_KINDS.join(", ")} (other when none fits).`,
    "note is one short line on when and how to take it (with food, morning/evening, what to keep apart).",
  );
  if (stack.length) {
    lines.push(
      "",
      "What I already take:",
      ...stack.map((s) => `- ${s.name}: ${formatDose(s.dose, s.unit)}${s.perDay > 1 ? ` ×${s.perDay} a day` : " a day"}`),
      "If the product is one of these, use exactly that name. Flag any overlap with my stack (the same nutrient twice) or a daily total above the usual upper limit.",
    );
  }
  lines.push(
    "",
    "Note the key ingredients and anything to watch in a few short lines, then end with only this JSON in a ```json block:",
    '{"supplements":[{"name":"Vitamin D3","kind":"d3","dose":2000,"unit":"IU","perDay":1,"note":"With a meal that has some fat."}]}',
  );
  return lines.join("\n");
}

/* ─── reading the reply ────────────────────────────────────── */

const UNIT_WORDS: ReadonlyArray<[RegExp, SuppUnit]> = [
  [/^(µg|μg|mcg|ug|micrograms?)$/, "µg"],
  [/^(mg|milligrams?)$/, "mg"],
  [/^(g|grams?|gr)$/, "g"],
  [/^(iu|ui|i\.u\.)$/, "IU"],
  [/^(caps?|capsules?|softgels?|gel ?caps?)$/, "caps"],
  [/^(tabs?|tablets?|pills?|chewables?|gummies|gummy)$/, "tab"],
  [/^(ml|millilit(?:er|re)s?)$/, "ml"],
];

function unitFrom(v: unknown): SuppUnit | null {
  if (typeof v !== "string") return null;
  const u = v.trim().toLowerCase();
  return UNIT_WORDS.find(([re]) => re.test(u))?.[1] ?? null;
}

const KIND_WORDS: ReadonlyArray<[RegExp, SuppKind]> = [
  [/creatin/, "creatine"],
  [/multi/, "multi"],
  [/b[\s-]?complex|complex b/, "bcomplex"],
  [/b[\s-]?12|cobalamin/, "b12"],
  [/\bd3?\b|vitamin d|cholecalciferol/, "d3"],
  [/omega|fish oil|epa|dha/, "omega3"],
  [/magnes/, "magnesium"],
  [/zinc|\bzn\b/, "zinc"],
  [/vitamin c|ascorb/, "vitc"],
];

function kindFrom(raw: unknown, name: string): SuppKind {
  const k = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (isKind(k) && k !== "other") return k;
  const n = name.toLowerCase();
  return KIND_WORDS.find(([re]) => re.test(n))?.[1] ?? "other";
}

function suppFrom(raw: unknown): SuppEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = pick(o, ["name", "product", "supplement", "title"]);
  if (typeof name !== "string" || !name.trim()) return null;
  const doseRaw = pick(o, ["dose", "amount", "serving", "serving_size", "per_serving"]);
  const dose = toNum(doseRaw);
  if (!Number.isFinite(dose) || dose <= 0) return null;
  // "5 g" in the dose itself counts when there's no unit key.
  const unitRaw = pick(o, ["unit", "units", "dose_unit"]);
  const unit =
    unitFrom(unitRaw) ??
    (typeof doseRaw === "string" ? unitFrom(doseRaw.replace(/[-\d.,~\s]+/, "").trim()) : null);
  if (!unit) return null;
  const per = toNum(pick(o, ["perday", "per_day", "times_a_day", "times_per_day", "servings_per_day", "daily", "frequency"]));
  const note = pick(o, ["note", "notes", "how", "timing", "when"]);
  return {
    name: name.trim(),
    kind: kindFrom(pick(o, ["kind", "type", "category"]), name),
    dose: Math.round(dose * 100) / 100,
    unit,
    perDay: clampPerDay(Number.isFinite(per) && per > 0 ? per : 1),
    note: typeof note === "string" && note.trim() ? note.trim() : null,
  };
}

function suppsOf(data: unknown): SuppEstimate[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? pick(data as Record<string, unknown>, ["supplements", "stack", "products", "items"])
      : undefined;
  const arr: unknown[] = Array.isArray(list) ? list : data && typeof data === "object" ? [data] : [];
  return arr.map(suppFrom).filter((x): x is SuppEstimate => x !== null);
}

/** The products in a pasted Claude reply; throws (English message) when there are none. */
export function parseSuppReply(text: string): SuppEstimate[] {
  if (!text.trim()) throw new Error(ERR_EMPTY);
  for (const data of parsedCandidates(text)) {
    const found = suppsOf(data);
    if (found.length) return found;
  }
  throw new Error(ERR_NO_SUPPS);
}

/** Whether a pasted or shared reply is a supplement read, a menu (has "meals") or a single meal's estimate. */
export function replyKind(text: string): "supps" | "recipes" | "menu" | "meal" {
  for (const data of parsedCandidates(text)) {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      if (pick(o, ["supplements"]) !== undefined && suppsOf(data).length) return "supps";
      if (pick(o, ["recipes"]) !== undefined) {
        try {
          parseRecipeReply(text);
          return "recipes";
        } catch {
          // not a usable recipe list — fall through
        }
      }
    }
  }
  try {
    parseMenuReply(text);
    return "menu";
  } catch {
    return "meal";
  }
}

const key = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The stack item a read refers to, matched by name. */
export function stackMatch(stack: readonly Supplement[], name: string): Supplement | undefined {
  const k = key(name);
  return stack.find((s) => key(s.name) === k);
}
