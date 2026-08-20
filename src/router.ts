export type ViewName = "body" | "live" | "history" | "exercise";

export type Cleanup = () => void;

/** Navigation surface handed to every view. */
export interface Nav {
  /** Switch to a top-level view. */
  go(view: ViewName): void;
}
