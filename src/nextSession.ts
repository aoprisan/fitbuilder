import { isolationMovementsForMuscle } from "./movements";
import { suggestOverload } from "./overload";
import { identityFromMovement } from "./sheet";
import { exerciseKey } from "./stats";
import { trainTodayPicks } from "./trainToday";
import {
  isCardio,
  SHEET_SCHEMA_ID,
  SHEET_SCHEMA_VERSION,
  type LoggedExercise,
  type MuscleGroup,
  type RoutineExercise,
  type RoutineSheet,
  type SetTarget,
  type TrainingSession,
} from "./types";
import { uuid } from "./util";

/**
 * Next-session generator — closes the auto-regulation loop the analytics
 * already power. The muscle ranking comes from {@link trainTodayPicks}
 * (recovered enough, least weekly stimulus banked first); each picked muscle
 * gets the user's own most-practised movement for it, prescribed at the
 * overload suggestion's reps × load. Everything is derived locally from the
 * logged history — the Claude routine prompts remain the deeper periodisation
 * tier above this.
 */

/** Working sets prescribed per exercise — the standard productive default. */
const SETS_PER_EXERCISE = 3;
/** Muscles (→ exercises) per drafted session: ~15 working sets, a full day. */
const MUSCLES_PER_SESSION = 5;

export interface NextSessionDraft {
  sheet: RoutineSheet;
  /** The muscles the draft targets, in prescription order. */
  muscles: MuscleGroup[];
  /** Total prescribed working sets. */
  setCount: number;
}

/**
 * The user's most-practised loggable movement for a muscle: most sessions
 * containing it, ties to the most recently trained. Cardio is excluded — a
 * drafted strength session prescribes reps × load. Null when the muscle has
 * no usable history.
 */
function preferredExercise(
  sessions: readonly TrainingSession[],
  muscle: MuscleGroup,
): LoggedExercise | null {
  const tally = new Map<string, { count: number; lastAt: string; ex: LoggedExercise }>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.muscle !== muscle || ex.sets.length === 0 || isCardio(ex.equipment)) continue;
      const key = exerciseKey(ex);
      const entry = tally.get(key);
      if (!entry) {
        tally.set(key, { count: 1, lastAt: s.startedAt, ex });
      } else {
        entry.count += 1;
        if (s.startedAt > entry.lastAt) {
          entry.lastAt = s.startedAt;
          entry.ex = ex;
        }
      }
    }
  }
  let best: { count: number; lastAt: string; ex: LoggedExercise } | null = null;
  for (const entry of tally.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.lastAt > best.lastAt)) {
      best = entry;
    }
  }
  return best ? best.ex : null;
}

/** A uniform per-set scheme at the overload suggestion (or a sane starter). */
function prescribe(
  sessions: readonly TrainingSession[],
  ex: Pick<LoggedExercise, "muscle" | "equipment" | "exerciseId">,
): SetTarget[] {
  const sug = suggestOverload(sessions, exerciseKey(ex), ex.equipment);
  const reps = sug?.reps ?? 10;
  const loadKg = sug !== null && sug.weightKg > 0 ? sug.weightKg : undefined;
  return Array.from({ length: SETS_PER_EXERCISE }, () => ({
    reps,
    ...(loadKg !== undefined ? { loadKg } : {}),
  }));
}

/**
 * Draft today's session from the logged history: recovered, under-dosed muscles
 * get the user's own go-to movement each, prescribed one progression step ahead.
 * Returns null when nothing was ever logged — the Claude plan flow covers the
 * cold start. The sheet is a normal structured-session routine: it can be
 * started live, run via Execute, edited, or saved like any other.
 */
export function draftNextSession(
  sessions: readonly TrainingSession[],
  name: string,
  sectionTitle: string,
  now: Date = new Date(),
): NextSessionDraft | null {
  const picks = trainTodayPicks(sessions, MUSCLES_PER_SESSION, now);
  if (picks.length === 0) return null;

  const muscles: MuscleGroup[] = [];
  const exercises: RoutineExercise[] = [];
  for (const pick of picks) {
    const logged = preferredExercise(sessions, pick.muscle);
    let row: RoutineExercise | null = null;
    if (logged) {
      row = {
        name: logged.name,
        muscle: logged.muscle,
        equipment: logged.equipment,
        ...(logged.exerciseId !== undefined ? { exerciseId: logged.exerciseId } : {}),
        ...(logged.secondaryMuscles && logged.secondaryMuscles.length > 0
          ? { secondaryMuscles: [...logged.secondaryMuscles] }
          : {}),
        target: { kind: "sets", sets: prescribe(sessions, logged) },
      };
    } else {
      // Never trained: seed from the catalog's first isolation pick, unloaded.
      const mv = isolationMovementsForMuscle(pick.muscle)[0];
      if (mv) {
        row = {
          name: mv.name,
          ...identityFromMovement(mv),
          target: {
            kind: "sets",
            sets: Array.from({ length: SETS_PER_EXERCISE }, () => ({ reps: 10 })),
          },
        };
      }
    }
    if (row) {
      exercises.push(row);
      muscles.push(pick.muscle);
    }
  }
  if (exercises.length === 0) return null;

  const sheet: RoutineSheet = {
    schema: SHEET_SCHEMA_ID,
    version: SHEET_SCHEMA_VERSION,
    id: uuid(),
    name,
    routines: [
      {
        kind: "session",
        title: name,
        tags: [],
        exercises: [],
        sections: [{ title: sectionTitle, exercises }],
      },
    ],
    createdAt: now.toISOString(),
  };
  return { sheet, muscles, setCount: exercises.length * SETS_PER_EXERCISE };
}
