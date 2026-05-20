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

/**
 * The sheet seeded on first run — transcribed from a real "RUTINA IMPINS"
 * push-day wall-chart so the builder opens with a recognizable example.
 */
export function defaultSheet(): RoutineSheet {
  const routines: Routine[] = [
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
