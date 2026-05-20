import type { Equipment, ExercisePlan } from "./types";
import { clamp } from "./util";

export type SessionPhase = "idle" | "ready" | "resting" | "paused" | "done";

export type RestSound = "tick" | "go";

export interface Step {
  exerciseIndex: number;
  name: string;
  equipment: Equipment;
  /** 0-based index of this set within its exercise. */
  setIndex: number;
  /** total sets in this exercise. */
  setCount: number;
  reps: number;
  weightKg: number;
}

/** Flatten a plan into ordered steps — one per set, in exercise order. */
export function flatten(plan: ExercisePlan): Step[] {
  const steps: Step[] = [];
  plan.exercises.forEach((ex, exerciseIndex) => {
    ex.sets.forEach((set, setIndex) => {
      steps.push({
        exerciseIndex,
        name: ex.name,
        equipment: ex.equipment,
        setIndex,
        setCount: ex.sets.length,
        reps: set.reps,
        weightKg: set.weightKg,
      });
    });
  });
  return steps;
}

/**
 * Session state machine: idle → ready → resting → (paused) → … → done.
 *
 * It is time-source agnostic — every time-sensitive method takes a monotonic
 * `now` (milliseconds, e.g. performance.now()). Rest is tracked against a fixed
 * end timestamp so pausing/resuming cannot accumulate drift, and the elapsed
 * clock freezes while paused.
 */
export class SessionController {
  readonly steps: Step[];
  readonly restMs: number;

  private _phase: SessionPhase = "idle";
  private _index = 0;

  // Elapsed clock.
  private acc = 0;
  private runningSince: number | null = null;

  // Rest tracking.
  private restEndsAt = 0;
  private pausedRemaining = 0;
  private beeped = new Set<number>();

  constructor(plan: ExercisePlan) {
    this.steps = flatten(plan);
    this.restMs = Math.max(0, Math.round(plan.restSec)) * 1000;
  }

  get phase(): SessionPhase {
    return this._phase;
  }

  get index(): number {
    return this._index;
  }

  get isRest(): boolean {
    return this._phase === "resting" || this._phase === "paused";
  }

  // ---- Clock ---------------------------------------------------------------
  private startClock(now: number): void {
    if (this.runningSince === null) this.runningSince = now;
  }

  private stopClock(now: number): void {
    if (this.runningSince !== null) {
      this.acc += now - this.runningSince;
      this.runningSince = null;
    }
  }

  elapsedMs(now: number): number {
    return this.acc + (this.runningSince !== null ? now - this.runningSince : 0);
  }

  // ---- Queries -------------------------------------------------------------
  /** The step the UI should show: the next set during rest, else the current. */
  displayStep(): Step | undefined {
    if (this._phase === "done") return undefined;
    const i = this.isRest ? this._index + 1 : this._index;
    return this.steps[i];
  }

  /** Number of sets fully completed so far. */
  completedSets(): number {
    if (this._phase === "done") return this.steps.length;
    if (this.isRest) return this._index + 1;
    return this._index;
  }

  remainingRestMs(now: number): number {
    if (this._phase === "resting") return Math.max(0, this.restEndsAt - now);
    if (this._phase === "paused") return this.pausedRemaining;
    return 0;
  }

  /** Fraction of rest remaining, 1 → 0, for the countdown dial. */
  restFraction(now: number): number {
    if (this.restMs <= 0) return 0;
    return clamp(this.remainingRestMs(now) / this.restMs, 0, 1);
  }

  primaryLabel(): string {
    switch (this._phase) {
      case "idle":
        return "START";
      case "ready":
        return "SET DONE";
      case "resting":
        return "PAUSE";
      case "paused":
        return "RESUME";
      case "done":
        return "DONE";
    }
  }

  // ---- Transitions ---------------------------------------------------------
  /** Drive the single primary button per the current phase. */
  onPrimary(now: number): void {
    switch (this._phase) {
      case "idle":
        this.start(now);
        break;
      case "ready":
        this.completeSet(now);
        break;
      case "resting":
      case "paused":
        this.togglePause(now);
        break;
      case "done":
        break;
    }
  }

  start(now: number): void {
    if (this._phase !== "idle" || this.steps.length === 0) return;
    this._index = 0;
    this.acc = 0;
    this.runningSince = now;
    this.beeped.clear();
    this._phase = "ready";
  }

  completeSet(now: number): void {
    if (this._phase !== "ready") return;
    const isLast = this._index >= this.steps.length - 1;
    if (isLast) {
      this.stopClock(now);
      this._phase = "done";
      return;
    }
    if (this.restMs <= 0) {
      this._index += 1;
      return;
    }
    this.restEndsAt = now + this.restMs;
    this.beeped.clear();
    this._phase = "resting";
  }

  togglePause(now: number): void {
    if (this._phase === "resting") {
      this.pausedRemaining = Math.max(0, this.restEndsAt - now);
      this.stopClock(now);
      this._phase = "paused";
    } else if (this._phase === "paused") {
      this.restEndsAt = now + this.pausedRemaining;
      this.startClock(now);
      this._phase = "resting";
    }
  }

  reset(): void {
    this._phase = "idle";
    this._index = 0;
    this.acc = 0;
    this.runningSince = null;
    this.restEndsAt = 0;
    this.pausedRemaining = 0;
    this.beeped.clear();
  }

  /**
   * Advance time. Returns any sounds that should play this frame.
   * Auto-advances to the next set when the rest timer elapses.
   */
  tick(now: number): RestSound[] {
    if (this._phase !== "resting") return [];
    const remaining = this.restEndsAt - now;
    if (remaining <= 0) {
      this._index += 1;
      this.beeped.clear();
      this._phase = "ready";
      return ["go"];
    }
    const secs = Math.ceil(remaining / 1000);
    if (secs <= 3 && secs >= 1 && !this.beeped.has(secs)) {
      this.beeped.add(secs);
      return ["tick"];
    }
    return [];
  }
}
