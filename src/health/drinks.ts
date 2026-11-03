/**
 * Drinks for the Water view. Hydration is not the same as volume: every drink
 * has a `factor`, and effective hydration is `amountMl * factor`. Caffeine and
 * alcohol content feed the "still in you" estimates (`metabolism.ts`).
 */

export type DrinkKind =
  | "water"
  | "tea"
  | "coffee"
  | "beerNA"
  | "beerLight"
  | "beer"
  | "beerStrong";

export interface DrinkMeta {
  /** English label (translated with t() at render time). */
  label: string;
  factor: number;
  /** CSS custom property holding the drink's accent colour. */
  accentVar: string;
  note?: string;
  /** Caffeine content, mg per ml. */
  caffeineMgPerMl: number;
  /** Alcohol by volume, in percent. */
  abv: number;
}

export const DRINKS: Record<DrinkKind, DrinkMeta> = {
  water: { label: "Water", factor: 1.0, accentVar: "--drink-water", caffeineMgPerMl: 0, abv: 0 },
  tea: { label: "Tea", factor: 0.9, accentVar: "--drink-tea", caffeineMgPerMl: 0.2, abv: 0 },
  coffee: { label: "Coffee", factor: 0.7, accentVar: "--drink-coffee", caffeineMgPerMl: 0.4, abv: 0 },
  beerNA: {
    label: "NA beer",
    factor: 0.95,
    accentVar: "--drink-beer-na",
    note: "≤0.5% abv",
    caffeineMgPerMl: 0,
    abv: 0.4,
  },
  beerLight: {
    label: "Light beer",
    factor: 0.6,
    accentVar: "--drink-beer-light",
    note: "≤5% abv",
    caffeineMgPerMl: 0,
    abv: 4.2,
  },
  beer: {
    label: "Beer",
    factor: 0.5,
    accentVar: "--drink-beer",
    note: "5–7% abv",
    caffeineMgPerMl: 0,
    abv: 5.8,
  },
  beerStrong: {
    label: "Strong beer",
    factor: 0.3,
    accentVar: "--drink-beer-strong",
    note: ">7% abv",
    caffeineMgPerMl: 0,
    abv: 8.5,
  },
};

export const DRINK_ORDER: readonly DrinkKind[] = [
  "water",
  "tea",
  "coffee",
  "beerNA",
  "beerLight",
  "beer",
  "beerStrong",
];

export const QUICK_SIZES_ML = [150, 250, 330, 500, 750, 1000] as const;

export interface DrinkEntry {
  id: string;
  /** Epoch ms. */
  ts: number;
  amountMl: number;
  kind: DrinkKind;
}

export function isDrinkKind(k: unknown): k is DrinkKind {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(DRINKS, k);
}

export function hydrationOf(entry: DrinkEntry): number {
  return entry.amountMl * DRINKS[entry.kind].factor;
}
