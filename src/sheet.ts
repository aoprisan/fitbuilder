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
          ...(e.setTargets
            ? {
                setTargets: e.setTargets.map((t) => ({
                  reps: t.reps,
                  ...(t.loadKg !== undefined ? { loadKg: t.loadKg } : {}),
                })),
              }
            : {}),
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

/** Stable id for the bundled pull-day chart, so re-seeding it is idempotent. */
export const PULL_SHEET_ID = "seed-rutina-tras" as const;

/**
 * The "RUTINA TRAS" pull-day wall-chart, transcribed from the printed routine
 * sheet. Each level is one routine (easiest to hardest), with the three colour-
 * coded "TEST FLUX" challenge blocks interleaved where they appear on the chart.
 */
export function defaultPullSheet(): RoutineSheet {
  const routines: Routine[] = [
    {
      title: "RUTINA TRAS",
      tags: ["INCEPATOR", "PARC", "BAIAT", "1-10 antrenamente"],
      exercises: [
        ex("Ramat Banda Elastica", "50 repetari"),
        ex("Tractiuni Banda El. Supinatie", "15-30 repetari"),
        ex("Tractiuni Banda El. Pronatie", "10-20 repetari"),
        ex("Australiene Bara Pronatie", "30-40 repetari"),
        ex("Australiene Bara Supinatie", "20-30 repetari"),
        ex("Trageri TRX Wide", "20-30 repetari"),
        ex("Hiper Extensii (Superman)", "30-50 repetari"),
        ex("Bicepsi TRX/Benzi/Gantere", "20-50 repetari"),
        ex("Dead Hang", "20 secunde x 5"),
      ],
    },
    {
      title: "RUTINA TRAS",
      tags: ["INCEPATOR +", "PARC", "BAIAT", "10-30 antrenamente"],
      exercises: [
        ex("Ramat Banda Elastica", "50 repetari"),
        ex("Tractiuni Banda El. Pronatie", "20-25 repetari"),
        ex("Tractiuni Supinatie Negative", "15-20 repetari (5 secunde/repetare)"),
        ex("Australiene Bara Pronatie + Supinatie + Pronatie Close Grip", "5+5+5 x 5"),
        ex("Trageri TRX Supinat", "50 repetari"),
        ex("Hiper Extensii (Superman) Snow Angels", "30-50 repetari"),
        ex("Bicepsi TRX/Benzi/Gantere", "40-60 repetari"),
        ex("Ramat Banda Galbena o mana", "30-40 repetari/mana"),
        ex("Dead Hang", "30 secunde x 5"),
      ],
    },
    {
      title: "TEST FLUX INCEPATORI",
      tags: ["TEST FLUX", "BAIETI", "Cod culoare: GALBEN", "Timp Total 3 MIN"],
      exercises: [
        ex("Chin-Ups", "5"),
        ex("Flotari Sol", "15"),
        ex("Genuflexiuni", "20"),
        ex("Triceps Dips", "15"),
        ex("Dead Hang", "30 sec"),
        ex("Plank", "30 sec"),
      ],
    },
    {
      title: "RUTINA TRAS",
      tags: ["INTERMEDIAR", "PARC", "BAIAT", "30-60 antrenamente"],
      exercises: [
        ex("Australiene Bara Pronatie + Supinatie + Pronatie Close Grip", "5+5+5 x 3"),
        ex("Muscle-Up Banda", "10-20 repetari"),
        ex("Tractiuni Pronate", "20-30 repetari"),
        ex("Tractiuni Supinate", "15-30 repetari"),
        ex("Tractiuni Commando/Neutre", "15-30 repetari"),
        ex("Izometrie Pronatie 90*", "15 secunde x5"),
        ex("Australiene pe Inele cu Vesta 10 KG inclinat 45*", "30-40 repetari"),
        ex("Biceps in Inele", "30-40 repetari"),
        ex("Biceps cu Gantere 7.5 KG", "40-50 repetari"),
        ex("Dead Hang + Vesta 10 KG", "30-40 secunde x5"),
      ],
    },
    {
      title: "TEST FLUX OFICIAL",
      tags: ["TEST FLUX", "Cod culoare: ALBASTRU", "Total Time 5 MINUTE"],
      exercises: [
        ex("Tractiuni", "10"),
        ex("Dips", "15"),
        ex("Diamond Push Ups", "20"),
        ex("Genuflexiuni + Vesta 10 KG", "30"),
        ex("L-sit Hold adunat", "20 secunde"),
        ex("Hollow Body Inele adunat", "30 secunde"),
        ex("Australiene Inele", "15"),
        ex("Flotari", "15"),
      ],
    },
    {
      title: "RUTINA TRAS",
      tags: ["INTERMEDIAR EXTRA", "PARC", "BAIAT", "60-100 antrenamente"],
      exercises: [
        ex("Piramida Pull Up", "1-2-3-4-5-4-3-2-1 x1"),
        ex("Muscle-Up", "20-30 repetari"),
        ex("Reverse Dead Lifts", "15-25 repetari"),
        ex("Tractiuni Pronate + Vesta 10-20 KG", "20-30 repetari"),
        ex("Tractiuni Supinate pe Inele + Vesta 10 KG", "15-30 repetari"),
        ex("Tractiuni Archer", "15 repetari/brat"),
        ex("Australiene pe Inele Combo - (5 Pull + 5 sec Hold + 5 Pull + sec Hold)", "x3"),
        ex("Piramida Pull Up", "1-2-3-4-5-4-3-2-1 x1"),
        ex("Biceps Inele + Gantere Superset", "10+10 x3"),
      ],
    },
    {
      title: "RUTINA TRAS",
      tags: ["AVANSATI", "PARC", "BAIAT", "100-150 antrenamente"],
      exercises: [
        ex("Australiene + Vesta 10 KG Bara", "5 wide 5 normal 5 close 5 sec hold x3"),
        ex("Muscle-Ups", "30 repetari"),
        ex("Pull-Ups Weighted 20-40 KG", "10-30 repetari"),
        ex("Chin-Ups Weighted 20-40 KG", "20-30 repetari"),
        ex("Close Grip Chin-Ups + Vesta 10 KG", "30 repetari"),
        ex("Pull Ups / Chin-Ups / Commando Pull", "100 repetari"),
        ex("Australiene Bara Wide/Normal/Close alternativ", "100 repetari"),
      ],
    },
    {
      title: "TEST FLUX AVANSATI",
      tags: ["TEST FLUX", "Cod culoare: ROSU", "Total Time 5 MINUTE"],
      exercises: [
        ex("Muscle-Ups", "5"),
        ex("Straight Bar Dips", "20"),
        ex("Pull-Ups", "15"),
        ex("Dips", "30"),
        ex("Pistols/Picior", "10"),
        ex("Leg Raises toes to Bar", "15"),
        ex("Flotari", "50"),
      ],
    },
    {
      title: "RUTINA TRAS",
      tags: ["AVANSATI EXTRA", "PARC", "BAIAT", "150-200 antrenamente"],
      exercises: [
        ex("Australiene + Vesta 10 KG Bara", "5 wide 5 normal 5 close 5 sec hold x3"),
        ex("Muscle-Ups + 5-10 KG", "20-30 repetari"),
        ex("Muscle-Ups Piramida", "1-2-3-4-5-4-3-2-1"),
        ex("Pull-Ups Weighted 30+ KG", "10-30 repetari"),
        ex("Chin-Ups Weighted 30+ KG", "20-30 repetari"),
        ex("One Arm Chin Up - Asistat", "20 repetari/mana"),
        ex("Reverse Deadlifts", "30-40 repetari"),
        ex("Pull Ups / Chin-Ups / Commando Pull", "100 repetari"),
        ex("Australiene Bara Wide/Normal/Close alternativ", "100 repetari"),
      ],
    },
    {
      title: "RUTINA TRAS",
      tags: ["ZEU", "PARC", "BAIAT", "200+ antrenamente"],
      exercises: [
        ex("Australiene + Vesta 10 KG Bara", "5 wide 5 normal 5 close 5 sec hold x3"),
        ex("One Arm Pull-Ups", "10 repetari/mana"),
        ex("Muscle-Ups + 10 KG +", "20 repetari"),
        ex("Muscle-Ups Piramida", "1-2-3-4-5-6-7-8-7-6-5-4-3-2-1"),
        ex("Pull-Ups Weighted 30+ KG", "10-30 repetari"),
        ex("Chin-Ups Weighted 30+ KG", "20-30 repetari"),
        ex("Reverse Deadlift", "30-40 repetari"),
        ex("Pull Ups / Chin-Ups / Commando Pull", "100 repetari"),
        ex("Australiene Bara Wide/Normal/Close alternativ", "100 repetari"),
      ],
    },
  ];

  return {
    schema: SHEET_SCHEMA_ID,
    version: SHEET_SCHEMA_VERSION,
    id: PULL_SHEET_ID,
    name: "Rutina Tras — Calisthenics",
    routines,
    updatedAt: new Date().toISOString(),
  };
}
