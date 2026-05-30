/* =============================================================================
   Internationalisation — a tiny, dependency-free translation layer.

   Strategy: the *English string is the key*. Source code keeps its readable
   English literals wrapped in t("…"); when the language is Romanian we look the
   string up in the RO table below, falling back to the English key if it has no
   entry yet. This keeps the diff small (no opaque key constants), makes missing
   translations degrade gracefully, and means English mode is a pure pass-through.

   Stored in localStorage like the other global settings (mode, trainer name,
   logo). Views are remounted from scratch on navigation, so a language change
   just needs to re-run the current view — main.ts subscribes via onLangChange.
   ========================================================================== */

export type Lang = "en" | "ro";

const KEY = "gymlog.lang";

type Listener = (lang: Lang) => void;
const listeners = new Set<Listener>();

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "ro" ? "ro" : "en";
  } catch {
    return "en";
  }
}

/** Current language; defaults to English. */
let current: Lang = read();

export function getLang(): Lang {
  return current;
}

/** Switch language, persist it, and notify subscribers (which re-render). */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Best effort — falling back to the default language is harmless.
  }
  for (const fn of listeners) fn(lang);
}

/** Subscribe to language changes; returns an unsubscribe function. */
export function onLangChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Translate an English source string to the current language. English is a
 * pass-through; Romanian falls back to the English key when no entry exists.
 */
export function t(en: string): string {
  if (current === "en") return en;
  return RO[en] ?? en;
}

/* -----------------------------------------------------------------------------
   Romanian translations. Keys are the exact English source strings.
   Glossary for consistency: rep = repetare/repetări · set = serie/serii ·
   weight = greutate · rest = pauză · routine = rutină · workout/session =
   antrenament/sesiune · muscle = mușchi · recovery = recuperare.
   -------------------------------------------------------------------------- */
const RO: Record<string, string> = {
  // — Muscle group labels (types.ts MUSCLE_LABELS) —
  Chest: "Piept",
  Back: "Spate",
  Shoulders: "Umeri",
  Traps: "Trapez",
  Biceps: "Biceps",
  Triceps: "Triceps",
  Legs: "Picioare",
  Glutes: "Fesieri",
  Core: "Abdomen",
  Forearms: "Antebrațe",
  Calves: "Gambe",

  // — Equipment labels (types.ts EQUIPMENT_LABELS) —
  Cable: "Cablu",
  Dumbbell: "Gantere",
  Barbell: "Bară",
  Kettlebell: "Kettlebell",
  TRX: "TRX",
  Calisthenics: "Calistenie",
  Machine: "Aparat",
  "Triceps Press": "Presă Triceps",
  "Bench Press": "Împins la Bancă",
  "Lat Pulldown": "Tracțiuni la Helcometru",
  "Rear Delt Fly": "Fluturări Spate Umăr",
  "Lateral Raise": "Ridicări Laterale",
  "Lateral Abs Machine": "Aparat Abdomen Lateral",

  // — Navigation / header —
  Home: "Acasă",
  Train: "Antrenament",
  Routines: "Rutine",
  Stats: "Statistici",
  Recovery: "Recuperare",
  Student: "Elev",
  Trainer: "Antrenor",
  Light: "Zi",
  Dark: "Noapte",
};

/** Add or override translations (used to assemble per-view strings). */
export function registerTranslations(entries: Record<string, string>): void {
  Object.assign(RO, entries);
}
