import type { SelectMode } from "../liveProgress";
import type { PrHit } from "../records";
import type { Equipment, LoggedExercise, MuscleGroup, SetType } from "../types";

/** Top-level place in the live flow. */
export type Stage = "list" | "select" | "exercise";
/** Where we are within a single exercise. */
export type SetSub = "idle" | "running" | "logging" | "resting";

/**
 * Everything the live logger's screens read and write, in one object: where
 * the user is in the flow, the pending selection, the in-flight set values and
 * the wall-clock anchors of the running timers. Its persistent subset maps
 * field-for-field onto the resume snapshot (`LiveProgress`, see `snapshot()` /
 * `restore()` in views/live.ts).
 */
export interface LiveState {
  // — flow —
  stage: Stage;
  sub: SetSub;

  // — pending exercise selection (becomes a LoggedExercise on the first logged set) —
  muscle: MuscleGroup;
  equipment: Equipment;
  /** Selected catalog movement; drives the exercise name, load type, and secondary muscles. */
  movementId: string;
  /** Which exercise picker the select screen shows: muscle+gear ("custom") or compound lifts. */
  selectMode: SelectMode;
  /** Name filter over the select screen's exercise chips (long muscle catalogs). */
  movementFilter: string;
  /** The exercise being worked, once it has (or is about to get) sets. */
  currentEx: LoggedExercise | null;

  // — in-flight set values —
  setReps: number;
  setWeight: number;
  /** Hold time (seconds) for an isometric set (plank, dead hang). */
  setHoldSec: number;
  /** Cardio values (treadmill bout): distance km, speed km/h, incline %. */
  setDistanceKm: number;
  setSpeedKmh: number;
  setInclinePct: number;
  /** Reps in reserve for the set being logged; null until tapped (optional). */
  pendingRir: number | null;
  /** Warm-up / drop-set tag for the set being logged; null = working set. */
  pendingSetType: SetType | null;

  // — inline editing of a logged set (values held until the user taps Save) —
  /** Which logged set is open for editing; null = none. */
  editingSetIndex: number | null;
  editReps: number;
  editWeight: number;
  /** Hold time (seconds) when the edited set is an isometric hold. */
  editHoldSec: number;
  /** Reps in reserve for the edited set (null = leave intensity unweighted). */
  editRir: number | null;

  // — clocks, anchored to wall-clock epoch ms so they survive a reload or phone lock —
  setStartEpoch: number;
  setElapsedMs: number;
  /** Rest clock — starts the moment a set is committed, runs until the next set. */
  restStartEpoch: number;

  /**
   * Records broken by the most recently committed set — shown while resting,
   * cleared when the next set starts. Transient; not part of the resume snapshot.
   */
  prFlash: PrHit[];
  /** Moves the expectation chart's marker to a load; set while the dials are up. */
  markExpectLoad: ((weightKg: number) => void) | null;
}

/** A fresh state: the list screen, or the select screen when a session is open. */
export function initialLiveState(sessionOpen: boolean): LiveState {
  return {
    stage: sessionOpen ? "select" : "list",
    sub: "idle",
    muscle: "chest",
    equipment: "dumbbell",
    movementId: "",
    selectMode: "custom",
    movementFilter: "",
    currentEx: null,
    setReps: 10,
    setWeight: 10,
    setHoldSec: 30,
    setDistanceKm: 1,
    setSpeedKmh: 8,
    setInclinePct: 0,
    pendingRir: null,
    pendingSetType: null,
    editingSetIndex: null,
    editReps: 0,
    editWeight: 0,
    editHoldSec: 0,
    editRir: null,
    setStartEpoch: 0,
    setElapsedMs: 0,
    restStartEpoch: 0,
    prFlash: [],
    markExpectLoad: null,
  };
}

/**
 * Per-render scroll/focus targets a screen hands back to `render()`: what to
 * bring into view after the repaint, and what the floating "back to the timer"
 * button returns to. Reset at the start of every render.
 */
export interface RenderFrame {
  /**
   * Element to bring to the top of the viewport after the render, instead of
   * jumping to page top — the action row during a running set / rest. Null
   * falls back to scroll-to-top.
   */
  scrollTargetEl: HTMLElement | null;
  /**
   * How it's brought into view: the in-set screens pin their action row to the
   * top; the select screen only nudges its dial into view ("nearest"), so a
   * repaint never shoves the page around under the thumb.
   */
  scrollTargetBlock: ScrollLogicalPosition;
  /**
   * What the floating "jump back" button returns to (the action/timer row, or
   * the ring dial on the select screen); it shows only while this is
   * off-screen, captioned by the text / aria label below.
   */
  focusAnchorEl: HTMLElement | null;
  focusAnchorText: string;
  focusAnchorAria: string;
}
