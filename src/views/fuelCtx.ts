import type { CutState } from "../health/cutModel";
import type { Nav } from "../router";

/** What each Fuel tab gets: the current cut state, a way to change it, and a repaint. */
export interface FuelCtx {
  nav: Nav;
  /** The current state (re-read after every update). */
  readonly state: CutState;
  /** Load → change → save, then repaint the open tab. */
  update(fn: (s: CutState) => CutState): void;
  /** Re-read storage (e.g. after a weigh-in went to the body-weight log) and repaint. */
  reload(): void;
}

/** "{0} of {1}" → filled. */
export function fill(s: string, ...args: (string | number)[]): string {
  return args.reduce<string>((acc, a, i) => acc.replace(`{${i}}`, String(a)), s);
}
