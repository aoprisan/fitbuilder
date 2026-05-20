import {
  SHEET_SCHEMA_ID,
  SHEET_SCHEMA_VERSION,
  type Routine,
  type RoutineExercise,
  type RoutineSheet,
} from "./types";
import { uuid } from "./util";

/** A blank prescription row used by the sheet builder's "add exercise" action. */
export function blankRoutineExercise(): RoutineExercise {
  return { name: "", prescription: "" };
}

/** A blank routine used by the sheet builder's "add routine" action. */
export function blankRoutine(): Routine {
  return { title: "New Routine", tags: [], exercises: [blankRoutineExercise()] };
}

/** A fresh, empty sheet for the "New sheet" action. */
export function blankSheet(): RoutineSheet {
  return {
    schema: SHEET_SCHEMA_ID,
    version: SHEET_SCHEMA_VERSION,
    id: uuid(),
    name: "New Routine Sheet",
    routines: [blankRoutine()],
    updatedAt: new Date().toISOString(),
  };
}

function ex(name: string, prescription: string): RoutineExercise {
  return { name, prescription };
}

/** A human label for a single routine, e.g. "RUTINA IMPINS — INCEPATOR".
 *  Used to name a routine when it's run, exported, or saved on its own. */
export function routineLabel(routine: Routine): string {
  const title = routine.title.trim() || "Routine";
  const lead = routine.tags.find((t) => t.trim() !== "")?.trim();
  return lead ? `${title} — ${lead}` : title;
}

/**
 * Wrap a single routine in its own sheet so it can be run, exported, or saved
 * independently of the rest of the sheet. The id is derived from the parent
 * sheet and the routine's slot, so re-saving the same routine updates its
 * library entry in place instead of piling up duplicates.
 */
export function singleRoutineSheet(
  parent: RoutineSheet,
  routine: Routine,
  index: number,
): RoutineSheet {
  return {
    schema: SHEET_SCHEMA_ID,
    version: SHEET_SCHEMA_VERSION,
    id: `${parent.id}:r${index}`,
    name: routineLabel(routine),
    routines: [
      {
        title: routine.title,
        tags: [...routine.tags],
        exercises: routine.exercises.map((e) => ({
          name: e.name,
          prescription: e.prescription,
        })),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The sheet seeded on first run — transcribed from a real "RUTINA IMPINS"
 * push-day wall-chart so the builder opens with a recognizable example.
 * Each section of the chart is one routine, ordered easiest to hardest.
 */
export function defaultSheet(): RoutineSheet {
  const routines: Routine[] = [
    {
      title: "RUTINA IMPINS",
      tags: ["INCEPATOR", "PARC", "BAIAT", "0-30 antrenamente"],
      exercises: [
        ex("Dips", "30-50 repetari"),
        ex("Flotari in Inele", "30-40 repetari"),
        ex("Dips Vesta 10 KG", "30-50 repetari"),
        ex("Pike Push-Ups", "20-40 repetari"),
        ex("Clapping Push-Ups", "20-40 repetari"),
        ex("Straight Bar Dips", "20-40 repetari"),
        ex("Hold Dip Inele", "20 secunde x 4/6 runde"),
        ex("Diamond Push-Ups", "30-50 repetari"),
        ex("Triceps Dips Banca/Cutie", "70 repetari"),
        ex("Triceps Extensii Spalier", "30-50 repetari"),
      ],
    },
    {
      title: "RUTINA IMPINS",
      tags: ["INTERMEDIAR+", "PARC", "BAIAT", "60-100 antrenamente"],
      exercises: [
        ex("Dips", "30-50 repetari"),
        ex("Flotari in Inele + Vesta", "30-40 repetari"),
        ex("Dips + KG (10+)", "30-50 repetari"),
        ex("Advanced Pike Push-Ups", "20-40 repetari"),
        ex("Straight Bar Dips", "20-40 repetari"),
        ex("Dips Inele Gimnastica", "20-40 repetari"),
        ex("Handstand Hold Perete", "20 secunde x 4/6 runde"),
        ex("Flotari Declinate", "30-50 repetari"),
        ex("Triceps Dips Banca/Cutie", "70 repetari"),
        ex("Triceps Extensii Spalier", "30-50 repetari"),
      ],
    },
    {
      title: "RUTINA IMPINS",
      tags: ["AVANSATI", "PARC", "BAIAT", "100-150 antrenamente"],
      exercises: [
        ex("Dips Pyramid", "1-2-3-4-5-6-7-8-7-6-5-4-3-2-1"),
        ex("Dips Inele", "50 repetari"),
        ex("Flotari Inele + Vesta", "50 repetari"),
        ex("Handstand Push-Ups Perete", "20 repetari"),
        ex("Straight Bar Dips", "30-50 repetari"),
        ex("Flotari Vesta Piramyd", "2-4-6-8-10-12-14-12-10-8-6-4-2"),
        ex("Flotari Advanced Pike", "20-40 repetari"),
        ex("Triceps Inele Dips", "30-50 repetari"),
      ],
    },
    {
      title: "RUTINA IMPINS",
      tags: ["AVANSATI PLUS", "PARC", "BAIAT", "150-200 antrenamente"],
      exercises: [
        ex("Dips Pyramid", "1-2-3-4-5-6-7-8-7-6-5-4-3-2-1"),
        ex("Dips Inele", "50 repetari"),
        ex("Flotari Inele + Vesta", "50 repetari"),
        ex("Handstand Push-Ups Perete", "20 repetari"),
        ex("Straight Bar Dips", "30-50 repetari"),
        ex("Flotari Vesta Piramyd", "2-4-6-8-10-12-14-12-10-8-6-4-2"),
        ex("Flotari Advanced Pike", "20-40 repetari"),
        ex("Triceps Inele Dips", "30-50 repetari"),
        ex("Presa Umeri Banda Elastica", "50-70 repetari"),
        ex("Triceps Spalier", "30-50 repetari"),
      ],
    },
    {
      title: "RUTINA IMPINS",
      tags: ["PARC", "FATA", "10-30 antrenamente"],
      exercises: [
        ex("Flotari pe Sol", "30-40 repetari"),
        ex("Dips Negative", "20 repetari"),
        ex("Flotari Departate", "20-30 repetari"),
        ex("Dips Banda Elastica", "30-40 repetari"),
        ex("Dips Cutie/Banca", "30-40 repetari"),
        ex("Flotari Diamant cu Banda Elastica", "30-45 repetari"),
        ex("Max Rep Flotari (cutie 40 cm)", "x 3 runde"),
        ex("Triceps Banda Elastica", "50-70 repetari"),
        ex("PLANK", "1 minut x 3/4 runde"),
      ],
    },
  ];

  return {
    schema: SHEET_SCHEMA_ID,
    version: SHEET_SCHEMA_VERSION,
    id: uuid(),
    name: "Rutina Impins — Calisthenics",
    routines,
    updatedAt: new Date().toISOString(),
  };
}
