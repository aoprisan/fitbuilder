import { CARDIO_LEG_CREDIT, cardioLegDose, fatigueProximity } from "./effort";
import { findMovement, isIsometricHold, SECONDARY_MUSCLE_SHARE } from "./movements";
import { muscleRecovery } from "./recovery";
import { exerciseKey, type ExerciseKey } from "./stats";
import {
  isBodyweight,
  isCardio,
  type Equipment,
  type FatigueLevel,
  type LoggedExercise,
  type MuscleGroup,
  type TrainingSession,
  type WorkSet,
} from "./types";
import { clamp, round2 } from "./util";

/**
 * Fatigue-adjusted performance expectation — "how much should I expect on this
 * movement *right now*?".
 *
 * A raw history read (best set, Epley 1RM) assumes you walk up to the lift
 * fresh. You rarely do: chest flies after six hard sets of bench are a very
 * different animal from flies as the opener. So the expectation layers a
 * pre-fatigue model on top of the lifter's history:
 *
 *  1. **Pre-fatigue at a moment** ({@link fatigueAt}) — "hard-set equivalents"
 *     already sitting on the movement's muscles: every earlier set this session
 *     that worked them (primary credit 1, secondary {@link SECONDARY_MUSCLE_SHARE},
 *     scaled by proximity to failure), residual fatigue from earlier days (the
 *     recovery clock's unrecovered fraction), a small systemic share of all the
 *     session's work, and the self-reported start-of-session fatigue.
 *  2. **Performance multiplier** ({@link performanceFactor}) — the fraction of
 *     fresh strength left under that load; it decays with diminishing returns
 *     toward a floor (fatigue never takes you to zero).
 *  3. **Fresh baseline** — each historic working set is *de-fatigued* by the
 *     pre-fatigue it was performed under, so if flies were always done after
 *     bench the history isn't mistaken for weakness. Today's own sets on the
 *     movement, when there are any, are blended in as the freshest evidence.
 *  4. **Expectation** — the fresh baseline × the multiplier now, read back as
 *     reps at a load (Epley solved for reps) or a load for a rep target.
 *
 * Heuristic by design (like the effort and recovery models): it's meant to set
 * a realistic number before the set, not to be a lab measurement. UI-free.
 */

/** Strength never drops below this share of fresh, however much work came first. */
const PERF_FLOOR = 0.55;
/** Decay per hard-set equivalent of pre-fatigue: ~6 hard sets → ≈ −14 %. */
const PERF_DECAY = 0.065;
/** A muscle at 0 % recovery carries this many hard sets' worth of residual fatigue. */
const RESIDUAL_SETS = 4;
/** Each hard set of anything this session adds this much whole-body fatigue. */
const SYSTEMIC_PER_SET = 0.08;
/** Hard-set equivalents per step of self-reported start fatigue above "Good". */
const START_FATIGUE_PER_LEVEL = 0.75;
/** Warm-up sets are real work but only lightly fatiguing. */
const WARMUP_SHARE = 0.25;
/** Reps assumed left in reserve on a historic set that didn't record RIR. */
const DEFAULT_RIR = 1;
/** Reps in reserve the expectation targets — a typical hard working set. */
const TARGET_RIR = 1;
/** How many of the movement's most recent performances feed the baseline. */
const BASELINE_PERFORMANCES = 6;
/** The baseline is the best of this many most-recent de-fatigued performances. */
const BASELINE_RECENT = 3;
/** Weight of today's de-fatigued sets against the historic baseline. */
const TODAY_WEIGHT = 0.5;
/** Epley gets unreliable past here; expectations are capped to it. */
const MAX_REPS = 30;
/** Body weight assumed for bodyweight gear when none is logged. */
const DEFAULT_BODYWEIGHT_KG = 75;

/** The muscles a movement taxes, with their share of its work. */
interface Target {
  primary: MuscleGroup;
  secondaries: readonly MuscleGroup[];
}

/** One named contributor to the pre-fatigue on a movement. */
export interface FatigueSource {
  /**
   * "exercise" — an earlier exercise this session (label = its name);
   * "residual" — not yet recovered from earlier days (label = the muscle);
   * "systemic" — overall session load; "start" — self-reported start fatigue.
   */
  kind: "exercise" | "residual" | "systemic" | "start";
  label: string;
  /** Logged sets behind an "exercise" source. */
  sets?: number;
  /** Unrecovered fraction behind a "residual" source, 0..1. */
  unrecovered?: number;
  /** Hard-set equivalents this source contributes. */
  load: number;
}

/** Pre-fatigue on a movement at one moment. */
export interface FatigueState {
  /** Total hard-set equivalents on the movement's muscles. */
  load: number;
  /** Fraction of fresh strength available, {@link PERF_FLOOR}..1. */
  factor: number;
  /** What the load is made of, largest first. */
  sources: FatigueSource[];
}

/** Fraction of fresh strength left under `load` hard-set equivalents. */
export function performanceFactor(load: number): number {
  return PERF_FLOOR + (1 - PERF_FLOOR) * Math.exp(-PERF_DECAY * Math.max(0, load));
}

/** How hard a set hit, in hard-set equivalents (before muscle share). */
function setDose(s: WorkSet, equipment: Equipment): number {
  if (isCardio(equipment)) return cardioLegDose(s);
  return fatigueProximity(s.rir) * (s.setType === "warmup" ? WARMUP_SHARE : 1);
}

/** Share of an exercise's set that lands on `muscle` (0 when it isn't worked). */
function muscleShareOf(ex: Pick<LoggedExercise, "muscle" | "equipment" | "secondaryMuscles">, muscle: MuscleGroup): number {
  if (isCardio(ex.equipment)) {
    return CARDIO_LEG_CREDIT.find((c) => c.muscle === muscle)?.share ?? 0;
  }
  if (ex.muscle === muscle) return 1;
  return ex.secondaryMuscles?.includes(muscle) ? SECONDARY_MUSCLE_SHARE : 0;
}

/** The target's muscles with their weight in the blended fatigue read. */
function weightedMuscles(target: Target): { muscle: MuscleGroup; w: number }[] {
  return [
    { muscle: target.primary, w: 1 },
    ...target.secondaries
      .filter((m) => m !== target.primary)
      .map((muscle) => ({ muscle, w: SECONDARY_MUSCLE_SHARE })),
  ];
}

/**
 * Pre-fatigue on `target` given the work already `done` this session (each
 * exercise carrying only the sets performed so far), the recovery fraction of
 * each muscle coming into the session, and the self-reported start fatigue.
 * Earlier sets of the movement itself count too — that's why set 4 trails set 1.
 */
export function fatigueAt(
  done: readonly LoggedExercise[],
  target: Target,
  recovered: (m: MuscleGroup) => number,
  startFatigue?: FatigueLevel,
): FatigueState {
  const muscles = weightedMuscles(target);
  const wSum = muscles.reduce((a, m) => a + m.w, 0);
  const sources: FatigueSource[] = [];

  // Local: earlier sets on the target's muscles, blended by the target's own split.
  const byExercise = new Map<string, FatigueSource>();
  let hardSets = 0;
  for (const ex of done) {
    let local = 0;
    let sets = 0;
    for (const s of ex.sets) {
      const dose = setDose(s, ex.equipment);
      if (s.setType !== "warmup") hardSets += isCardio(ex.equipment) ? dose : 1;
      let hit = 0;
      for (const { muscle, w } of muscles) hit += w * muscleShareOf(ex, muscle);
      if (hit <= 0) continue;
      local += (dose * hit) / wSum;
      sets++;
    }
    if (local <= 0) continue;
    const prev = byExercise.get(ex.name);
    if (prev) {
      prev.load += local;
      prev.sets = (prev.sets ?? 0) + sets;
    } else {
      byExercise.set(ex.name, { kind: "exercise", label: ex.name, sets, load: local });
    }
  }
  sources.push(...byExercise.values());

  // Residual: what earlier days left unrecovered on these muscles.
  for (const { muscle, w } of muscles) {
    const unrecovered = 1 - clamp(recovered(muscle), 0, 1);
    const load = (unrecovered * RESIDUAL_SETS * w) / wSum;
    if (load > 0.05) sources.push({ kind: "residual", label: muscle, unrecovered, load });
  }

  // Systemic: the whole session's workload, and how you felt walking in.
  if (hardSets > 0) {
    sources.push({ kind: "systemic", label: "session", sets: Math.round(hardSets), load: hardSets * SYSTEMIC_PER_SET });
  }
  if (startFatigue !== undefined && startFatigue > 2) {
    sources.push({ kind: "start", label: String(startFatigue), load: (startFatigue - 2) * START_FATIGUE_PER_LEVEL });
  }

  sources.sort((a, b) => b.load - a.load);
  const load = sources.reduce((a, s) => a + s.load, 0);
  return { load, factor: performanceFactor(load), sources };
}

/** The muscles a logged exercise (or catalog movement) taxes. */
function targetOf(ex: { muscle: MuscleGroup; secondaryMuscles?: readonly MuscleGroup[] }): Target {
  return { primary: ex.muscle, secondaries: ex.secondaryMuscles ?? [] };
}

/** Load the lifter actually moves: bodyweight gear adds body weight to the dialled kg. */
function effectiveLoad(weightKg: number, equipment: Equipment, bodyweightKg: number): number {
  return isBodyweight(equipment) ? bodyweightKg + Math.max(0, weightKg) : weightKg;
}

/** Epley 1RM from a set's reps-to-failure (reps + reserve). */
function capacityE1rm(load: number, reps: number, rir: number | undefined): number {
  if (load <= 0 || reps <= 0) return 0;
  return load * (1 + (reps + (rir ?? DEFAULT_RIR)) / 30);
}

/**
 * De-fatigued e1RM for one performance of the movement (0 when none): its best
 * *demonstrated* set (highest raw estimate, earliest on a tie), corrected for the
 * pre-fatigue it was lifted under. Anchoring on the best actual set — rather than
 * de-fatiguing every set and taking the max — keeps a straight 3×12 (whose later
 * sets weren't to failure) from reading as more strength than was ever shown.
 */
function freshBest(
  session: TrainingSession,
  key: ExerciseKey,
  recovered: (m: MuscleGroup) => number,
  bodyweightKg: number,
): number {
  let bestRaw = 0;
  let best = 0;
  session.exercises.forEach((ex, i) => {
    if (exerciseKey(ex) !== key) return;
    ex.sets.forEach((s, j) => {
      if (s.setType === "warmup") return;
      const e1 = capacityE1rm(effectiveLoad(s.weightKg, ex.equipment, bodyweightKg), s.reps, s.rir);
      if (e1 <= bestRaw) return;
      bestRaw = e1;
      const done = [...session.exercises.slice(0, i), { ...ex, sets: ex.sets.slice(0, j) }];
      const f = fatigueAt(done, targetOf(ex), recovered, session.startFatigue);
      best = e1 / f.factor;
    });
  });
  return best;
}

/** Recovery lookup for the muscles coming into a session that started at `at`. */
function recoveryBefore(
  sessions: readonly TrainingSession[],
  at: string,
  excludeId?: string,
): (m: MuscleGroup) => number {
  const before = sessions.filter((s) => s.id !== excludeId && s.startedAt < at);
  const rec = new Map(muscleRecovery(before, new Date(at)).map((r) => [r.muscle, r.recovered] as const));
  return (m) => rec.get(m) ?? 1;
}

/** The fatigue-adjusted read for one movement, now. */
export interface Expectation {
  /** Fresh (unfatigued) estimated 1RM on effective load, kg. */
  freshE1rm: number;
  /** What's left of it right now, kg. */
  nowE1rm: number;
  /** Pre-fatigue right now. */
  fatigue: FatigueState;
  /** Historic performances behind the baseline. */
  basis: number;
  /** Whether today's sets on this movement fed the baseline. */
  usesToday: boolean;
  equipment: Equipment;
  bodyweightKg: number;
}

export interface ExpectationInput {
  /** Every saved session *except* the active one. */
  prior: readonly TrainingSession[];
  /** The in-progress session (its logged sets are the work already done). */
  active: TrainingSession | null;
  /** Movement being forecast. */
  muscle: MuscleGroup;
  equipment: Equipment;
  exerciseId?: string;
  bodyweightKg?: number;
  now?: Date;
}

/**
 * Forecast for one movement given its history and the fatigue on its muscles
 * right now. Null for cardio and timed holds, and when there's nothing loaded
 * on record to forecast from (no history and no set today).
 */
export function expectNow(input: ExpectationInput): Expectation | null {
  const { prior, active, muscle, equipment } = input;
  if (isCardio(equipment) || isIsometricHold(input.exerciseId)) return null;
  const bodyweightKg = input.bodyweightKg ?? DEFAULT_BODYWEIGHT_KG;
  const key = exerciseKey(input.exerciseId !== undefined ? { muscle, equipment, exerciseId: input.exerciseId } : { muscle, equipment });
  const mv = input.exerciseId !== undefined ? findMovement(input.exerciseId) : undefined;
  const target: Target = { primary: muscle, secondaries: mv?.secondaryMuscles ?? [] };

  // Historic baseline: newest performances, each set de-fatigued by the
  // pre-fatigue it was lifted under.
  const performances = prior
    .filter((s) => s.exercises.some((ex) => exerciseKey(ex) === key && ex.sets.length > 0))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, BASELINE_PERFORMANCES);
  const bests = performances
    .map((s) => freshBest(s, key, recoveryBefore(prior, s.startedAt, s.id), bodyweightKg))
    .filter((v) => v > 0);
  const historic = bests.slice(0, BASELINE_RECENT).reduce((a, v) => Math.max(a, v), 0);

  // Coming into today's session vs. the lifter's recovery clocks.
  const now = input.now ?? new Date();
  const startedAt = active?.startedAt ?? now.toISOString();
  const recNow = recoveryBefore(prior, startedAt);
  const today = active ? freshBest(active, key, recNow, bodyweightKg) : 0;

  let freshE1rm = historic;
  if (today > 0) freshE1rm = historic > 0 ? historic * (1 - TODAY_WEIGHT) + today * TODAY_WEIGHT : today;
  if (freshE1rm <= 0) return null;

  const fatigue = fatigueAt(active?.exercises ?? [], target, recNow, active?.startFatigue);
  return {
    freshE1rm: round2(freshE1rm),
    nowE1rm: round2(freshE1rm * fatigue.factor),
    fatigue,
    basis: bests.length,
    usesToday: today > 0,
    equipment,
    bodyweightKg,
  };
}

/** Reps at `targetRir` the given 1RM predicts at a dialled load, capped to {@link MAX_REPS}. */
function repsFrom(e1rm: number, exp: Expectation, weightKg: number): number {
  const load = effectiveLoad(weightKg, exp.equipment, exp.bodyweightKg);
  if (load <= 0) return 0;
  return clamp(Math.round(30 * (e1rm / load - 1) - TARGET_RIR), 0, MAX_REPS);
}

/**
 * Unrounded expected reps (≈1 in reserve) at a dialled load, now and if fresh —
 * for drawing smooth curves; capped like {@link expectedReps}.
 */
export function expectedRepsCurve(exp: Expectation, weightKg: number): { now: number; fresh: number } {
  const at = (e1rm: number): number => {
    const load = effectiveLoad(weightKg, exp.equipment, exp.bodyweightKg);
    return load <= 0 ? 0 : clamp(30 * (e1rm / load - 1) - TARGET_RIR, 0, MAX_REPS);
  };
  return { now: at(exp.nowE1rm), fresh: at(exp.freshE1rm) };
}

/**
 * Dialled-load range worth plotting for a movement: from roughly 50 % of the
 * fresh max (a high-rep set) up to 95 % (a single). On bodyweight gear the
 * range is in *added* kg and starts at bodyweight alone. Null when the range is
 * too narrow to draw (e.g. bodyweight work far from any added load).
 */
export function plotLoadRange(exp: Expectation): { lo: number; hi: number } | null {
  const offset = isBodyweight(exp.equipment) ? exp.bodyweightKg : 0;
  const lo = Math.max(0, exp.freshE1rm * 0.5 - offset);
  const hi = exp.freshE1rm * 0.95 - offset;
  return hi - lo >= 1 ? { lo: round2(lo), hi: round2(hi) } : null;
}

/** Expected reps (≈1 in reserve) at a dialled load, now and if fresh. */
export function expectedReps(exp: Expectation, weightKg: number): { now: number; fresh: number } {
  return { now: repsFrom(exp.nowE1rm, exp, weightKg), fresh: repsFrom(exp.freshE1rm, exp, weightKg) };
}

/**
 * Dialled load (added kg on bodyweight gear) expected to get `reps` with ≈1 in
 * reserve right now, rounded down to the gear's `step`. Null when even the bare
 * movement is out of reach (bodyweight) or the result isn't a usable load.
 */
export function expectedLoad(exp: Expectation, reps: number, step: number): number | null {
  const load = exp.nowE1rm / (1 + (reps + TARGET_RIR) / 30);
  const dialled = isBodyweight(exp.equipment) ? load - exp.bodyweightKg : load;
  if (dialled < 0) return null;
  const rounded = step > 0 ? Math.floor(dialled / step) * step : dialled;
  if (rounded <= 0 && !isBodyweight(exp.equipment)) return null;
  return round2(rounded);
}

/** Percent of fresh strength fatigue is costing right now (0 = fresh). */
export function fatigueCostPct(exp: Expectation): number {
  return Math.round((1 - exp.fatigue.factor) * 100);
}
