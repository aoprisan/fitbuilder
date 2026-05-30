import type { Equipment } from "./types";

/**
 * Equipment- and compound-aware load model.
 *
 * The core insight: the *indicated* load (a cable stack, a barbell's plates, a
 * dumbbell's number) is not the same training stimulus across load types. A
 * cable runs through pulleys and lever arms, a machine guides the path and
 * removes stabilization, a barbell is moved freely against gravity with the
 * whole body bracing. So "70 on a cable" is not "70 on a bench press" — neither
 * in mechanical resistance nor in what it costs the body to recover from.
 *
 * Each load type carries a small profile of multipliers that separate the
 * outcomes the app already tracks:
 *
 *  - loadFidelity — how faithfully the indicated kg maps to real mechanical
 *    resistance at the muscle. Free weights are the 1.0 reference; cables and
 *    leverage machines read lower (their numbers overstate the work). This is
 *    the literal "70 cable ≠ 70 bench" knob, applied wherever load drives a
 *    metric (effort volume, strength estimate, hypertrophy volume).
 *  - cns — systemic / nervous-system cost per unit of that effective load.
 *    Heavy free-weight work taxes the CNS most; guided isolation least.
 *  - muscle — local muscle-damage / recovery demand per unit effective load.
 *  - strength — transfer to maximal strength (1RM). Free-weight compounds
 *    carry over most; cables and isolation machines least.
 *  - hypertrophy — growth stimulus per unit of effective volume. Largely
 *    volume-driven, so cables/machines sit near free weights here; the real
 *    correction for growth is using effective load, not penalising the modality.
 *
 * Layering is deliberate, not double counting: loadFidelity captures *less
 * resistance*, while cns/muscle capture *less neural & structural cost per unit
 * of resistance* (a guided path removes stabilization regardless of how heavy
 * the stack is). A cable is therefore both lighter and gentler — two separate
 * mechanisms that compound.
 *
 * Numbers are a researched first pass, tuned to keep behaviour close to the old
 * flat 0.5 cable discount while generalising it across every load type. They're
 * intentionally easy to retune from this one table.
 */
export interface LoadProfile {
  /** Indicated kg → barbell-equivalent effective load. 1.0 = free-weight reference. */
  loadFidelity: number;
  /** Systemic / CNS demand per unit effective load. */
  cns: number;
  /** Local muscle-damage / recovery demand per unit effective load. */
  muscle: number;
  /** Transfer to maximal strength (1RM). */
  strength: number;
  /** Growth stimulus per unit effective volume. */
  hypertrophy: number;
}

const BARBELL: LoadProfile = { loadFidelity: 1, cns: 1, muscle: 1, strength: 1, hypertrophy: 1 };

/**
 * Per-equipment load profiles. Several `Equipment` values
 * (`bench-press`, `triceps-press`, `lat-pulldown`, `rear-delt-fly`,
 * `lateral-raise`, `lateral-abs-machine`) are specific guided-machine classes,
 * so they share the low-stabilisation / lower-fidelity machine character.
 */
export const LOAD_PROFILES: Record<Equipment, LoadProfile> = {
  barbell: BARBELL,
  dumbbell: { loadFidelity: 1, cns: 0.95, muscle: 1, strength: 0.9, hypertrophy: 1.05 },
  kettlebell: { loadFidelity: 1, cns: 1, muscle: 0.9, strength: 0.85, hypertrophy: 0.9 },
  calisthenics: { loadFidelity: 1, cns: 0.9, muscle: 1, strength: 0.9, hypertrophy: 1 },
  trx: { loadFidelity: 1, cns: 0.8, muscle: 0.9, strength: 0.7, hypertrophy: 0.95 },
  cable: { loadFidelity: 0.6, cns: 0.7, muscle: 0.85, strength: 0.6, hypertrophy: 1.05 },
  machine: { loadFidelity: 0.8, cns: 0.65, muscle: 0.9, strength: 0.65, hypertrophy: 1 },
  "bench-press": { loadFidelity: 0.85, cns: 0.7, muscle: 0.95, strength: 0.7, hypertrophy: 1 },
  "lat-pulldown": { loadFidelity: 0.85, cns: 0.7, muscle: 0.9, strength: 0.65, hypertrophy: 1 },
  "triceps-press": { loadFidelity: 0.8, cns: 0.6, muscle: 0.9, strength: 0.6, hypertrophy: 1 },
  "lateral-raise": { loadFidelity: 0.8, cns: 0.5, muscle: 0.8, strength: 0.5, hypertrophy: 1 },
  "rear-delt-fly": { loadFidelity: 0.75, cns: 0.5, muscle: 0.8, strength: 0.5, hypertrophy: 1 },
  "lateral-abs-machine": { loadFidelity: 0.6, cns: 0.5, muscle: 0.8, strength: 0.5, hypertrophy: 0.95 },
  // Cardio (treadmill): no external load (these terms multiply a 0 kg load to 0),
  // so the numbers here only set its systemic/local recovery cost — a steady run
  // taxes the cardiovascular system and legs but carries no strength/hypertrophy
  // signal. Kept modest so a cardio bout reads as light-to-moderate fatigue.
  treadmill: { loadFidelity: 1, cns: 0.5, muscle: 0.6, strength: 0, hypertrophy: 0 },
};

// Compound lifts (those that tax secondary muscles) demand more from the whole
// system: more total tissue to repair, more coordination and bracing, and a
// stronger carry-over to maximal strength than isolation work. The systemic
// premium is kept modest — resistance training fatigue is mostly peripheral
// (muscle damage / perceived effort), and the evidence for a large extra
// *central* cost from compounds is weak (e.g. no reliable squat-vs-deadlift
// difference in central fatigue), so the bigger premium sits on the muscle term.
export const COMPOUND_CNS = 1.15;
export const COMPOUND_MUSCLE = 1.15;
export const COMPOUND_STRENGTH = 1.15;

export function profileFor(equipment: Equipment): LoadProfile {
  return LOAD_PROFILES[equipment];
}

/**
 * Indicated kg translated to a barbell-equivalent effective load — the
 * "70 on a cable ≠ 70 on a bench" conversion. Used wherever load drives a
 * metric (effort volume, strength estimate, hypertrophy volume).
 */
export function effectiveLoadKg(weightKg: number, equipment: Equipment): number {
  return Math.max(0, weightKg) * profileFor(equipment).loadFidelity;
}

/** CNS / systemic demand multiplier for a set (equipment × compound). */
export function cnsFactor(equipment: Equipment, isCompound: boolean): number {
  return profileFor(equipment).cns * (isCompound ? COMPOUND_CNS : 1);
}

/** Local muscle recovery-demand multiplier for a set (equipment × compound). */
export function muscleDemandFactor(equipment: Equipment, isCompound: boolean): number {
  return profileFor(equipment).muscle * (isCompound ? COMPOUND_MUSCLE : 1);
}

/** Maximal-strength transfer multiplier for a set (equipment × compound). */
export function strengthFactor(equipment: Equipment, isCompound: boolean): number {
  return profileFor(equipment).strength * (isCompound ? COMPOUND_STRENGTH : 1);
}

/** Hypertrophy-stimulus multiplier for a load type. */
export function hypertrophyFactor(equipment: Equipment): number {
  return profileFor(equipment).hypertrophy;
}
