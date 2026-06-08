import type { Equipment, MuscleGroup } from "./types";

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
 *
 * Retuned (2026) against the evidence rather than the original flat-0.5-cable
 * intuition. Three findings drove the changes:
 *  - At a *matched* load, machine/cable prime-mover activation is within single
 *    digits of free weights (pec-deck ≈98%, cable crossover ≈93% of barbell
 *    bench pectoralis EMG; ACE/UW–La Crosse), and volume-matched hypertrophy is
 *    null between modalities (Haugen et al. 2023, BMC Sports Sci Med Rehabil,
 *    SMD −0.055). So the machine `loadFidelity` discount was raised 0.8→0.9 and
 *    the steep `cns` discounts were compressed upward — the real modality
 *    difference is *stabiliser* recruitment, a fraction of total cost, not a
 *    loss of resistance at the muscle.
 *  - The machine/cable strength penalty was far too harsh: the specificity
 *    effect is real but *small* (free-weight-test advantage SMD ≈0.21, no
 *    overall between-modality difference; Haugen 2023), so `strength` ~0.6 →
 *    ~0.85–0.9, not a 35–40% loss.
 *  - Cables: the displayed-vs-real gap is deterministic pulley physics (2:1 ≈
 *    half, 1:1 ≈ full), a per-machine property, not a "cable" constant. 0.7 is a
 *    blend leaning toward the common 1:1 pulldown/row; the truly guided 1:1
 *    `lat-pulldown` is set to 0.95 (REP Fitness / Get RXd cable-ratio mechanics).
 */
export const LOAD_PROFILES: Record<Equipment, LoadProfile> = {
  barbell: BARBELL,
  dumbbell: { loadFidelity: 1, cns: 0.95, muscle: 1, strength: 0.9, hypertrophy: 1.05 },
  kettlebell: { loadFidelity: 1, cns: 1, muscle: 0.9, strength: 0.85, hypertrophy: 0.9 },
  calisthenics: { loadFidelity: 1, cns: 0.9, muscle: 1, strength: 0.9, hypertrophy: 1 },
  trx: { loadFidelity: 1, cns: 0.8, muscle: 0.9, strength: 0.7, hypertrophy: 0.95 },
  cable: { loadFidelity: 0.7, cns: 0.85, muscle: 0.85, strength: 0.85, hypertrophy: 1.05 },
  machine: { loadFidelity: 0.9, cns: 0.8, muscle: 0.9, strength: 0.88, hypertrophy: 1 },
  "bench-press": { loadFidelity: 0.9, cns: 0.8, muscle: 0.95, strength: 0.85, hypertrophy: 1 },
  "lat-pulldown": { loadFidelity: 0.95, cns: 0.85, muscle: 0.9, strength: 0.85, hypertrophy: 1 },
  "triceps-press": { loadFidelity: 0.85, cns: 0.75, muscle: 0.9, strength: 0.78, hypertrophy: 1 },
  "lateral-raise": { loadFidelity: 0.85, cns: 0.72, muscle: 0.8, strength: 0.75, hypertrophy: 1 },
  "rear-delt-fly": { loadFidelity: 0.8, cns: 0.72, muscle: 0.8, strength: 0.7, hypertrophy: 1 },
  "lateral-abs-machine": { loadFidelity: 0.7, cns: 0.72, muscle: 0.8, strength: 0.7, hypertrophy: 0.95 },
  // Cardio (treadmill): no external load (these terms multiply a 0 kg load to 0),
  // so the numbers here only set its systemic/local recovery cost — a steady run
  // taxes the cardiovascular system and legs but carries no strength/hypertrophy
  // signal. Kept modest so a cardio bout reads as light-to-moderate fatigue.
  treadmill: { loadFidelity: 1, cns: 0.5, muscle: 0.6, strength: 0, hypertrophy: 0 },
};

// Compound lifts (those that tax secondary muscles) demand more from the whole
// system: more total tissue to repair, more coordination and bracing, and a
// stronger carry-over to maximal strength than isolation work.
//
// The premium splits three ways, and the evidence supports them unequally:
//  - MUSCLE (recovery) and STRENGTH (1RM transfer) premiums are well-supported,
//    arguably conservative: multi-joint work raises creatine kinase more and
//    needs ~a full extra recovery day (leg press 48h vs knee-extension 24h to
//    restore torque; Soares 2015, PMC10286608), and transfers better to maximal
//    strength (Paoli 2017; though the edge shrinks in trained lifters).
//  - CNS: there is *no* reliable evidence compounds cost more *central* fatigue.
//    Barnes et al. 2019 (JSCR) found squat vs deadlift at 95% 1RM produced no
//    difference in voluntary activation despite the deadlift's heavier load —
//    the "deadlifts fry your CNS" belief fails for central fatigue. So the CNS
//    premium is trimmed to a token 1.05; the real systemic cost of compounds is
//    peripheral/metabolic, already captured by their extra volume and muscle term.
export const COMPOUND_CNS = 1.05;
export const COMPOUND_MUSCLE = 1.15;
export const COMPOUND_STRENGTH = 1.15;

export function profileFor(equipment: Equipment): LoadProfile {
  return LOAD_PROFILES[equipment];
}

/**
 * Per-muscle reference working load (kg, free-weight equivalent) — roughly what a
 * muscle group moves in one hard working set for an intermediate trainee. It's the
 * "56 kg shrug ≠ 56 kg curl" knob: traps/legs/glutes shift big loads, so a given
 * kg there is a *small* fraction of capacity; biceps/forearms/delts move much
 * less, so the same kg is a *large* fraction. Effort runs off how hard a set is,
 * not raw tonnage, so the volume term is normalised against this reference (a kg
 * counts more on a low-capacity muscle, less on a high-capacity one). Deliberately
 * rough and easy to retune; cardio carries no external load so its value is inert.
 */
export const MUSCLE_REFERENCE_LOAD_KG: Record<MuscleGroup, number> = {
  legs: 120,
  glutes: 110,
  traps: 125,
  calves: 110,
  back: 75,
  "lower-back": 70,
  chest: 65,
  // Delts split three ways: the front head presses real load (overhead/incline
  // pressing), while the side and rear heads only handle light isolation
  // (lateral / reverse-fly raises), so a given kg is a far larger fraction of
  // their capacity and must count up much harder.
  "front-delts": 45,
  "side-delts": 16,
  "rear-delts": 14,
  triceps: 32,
  biceps: 28,
  forearms: 30,
  core: 30,
  cardio: 60,
};

// Capacity normalisation is centred on this load: a muscle whose reference equals
// the baseline is neutral (factor 1). The factor is clamped so an extreme-capacity
// movement can't swing a set's volume term too far either way — the floor is low
// enough that very heavy work (shrugs, leg press, deadlifts) is discounted hard so
// its tonnage stops dominating the effort total.
const BASELINE_LOAD_KG = 60;
const MUSCLE_LOAD_FACTOR_MIN = 0.4;
const MUSCLE_LOAD_FACTOR_MAX = 2;

/**
 * Capacity normaliser for the effort gauge from a working-load reference:
 * `baseline ÷ reference`. >1 for low-load movements (a curl's 20 kg is a hard
 * set, so it counts up), <1 for high-load ones (a deadlift's 80 kg is routine, so
 * it counts down). Clamped to keep the swing bounded. The reference is the load a
 * movement (or, lacking one, its muscle) handles for a hard working set, so a back
 * extension and a deadlift on the same lower back normalise very differently.
 */
export function loadCapacityFactor(referenceLoadKg: number): number {
  const factor = BASELINE_LOAD_KG / referenceLoadKg;
  return Math.min(MUSCLE_LOAD_FACTOR_MAX, Math.max(MUSCLE_LOAD_FACTOR_MIN, factor));
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

/**
 * Fatigue cost per unit of effective load, for the effort gauge — how taxing a
 * kilogram of this load type actually is, blending its systemic ({@link LoadProfile.cns})
 * and local ({@link LoadProfile.muscle}) demand. A free-weight compound (an 86 kg
 * deadlift) costs the full reference; a guided machine isolation (an 86 kg back
 * extension) costs far less for the same indicated kg, so its volume stops
 * dominating the effort total. This layers on top of `loadFidelity` exactly as
 * the recovery factors do: `loadFidelity` says the machine moves *less* real
 * resistance, while this says each unit of that resistance is *gentler* — two
 * separate, compounding mechanisms, not a double count.
 */
export function effortLoadFactor(equipment: Equipment, isCompound: boolean): number {
  const p = profileFor(equipment);
  const perUnit = (p.cns + p.muscle) / 2;
  const compound = isCompound ? (COMPOUND_CNS + COMPOUND_MUSCLE) / 2 : 1;
  return perUnit * compound;
}

/** Maximal-strength transfer multiplier for a set (equipment × compound). */
export function strengthFactor(equipment: Equipment, isCompound: boolean): number {
  return profileFor(equipment).strength * (isCompound ? COMPOUND_STRENGTH : 1);
}

/** Hypertrophy-stimulus multiplier for a load type. */
export function hypertrophyFactor(equipment: Equipment): number {
  return profileFor(equipment).hypertrophy;
}
