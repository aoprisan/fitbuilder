import { logBodyweight, latestBodyweight } from "../bodyweightStore";
import { h } from "../dom";
import { registerTranslations, t } from "../i18n";

/* =============================================================================
   First-run welcome — shown on Body until the user dismisses it or logs a
   session: how the app works in three steps, an optional bodyweight (it feeds
   the protein / calorie estimates), and where the data lives.
   ========================================================================== */

registerTranslations({
  "Welcome to Gym Log": "Bun venit în Gym Log",
  "Log your sets — the app reads back what they did to you.":
    "Înregistrează-ți seriile — aplicația îți arată ce efect au avut.",
  "Start a session and pick an exercise on the ring: muscle group first, then the movement.":
    "Pornește o sesiune și alege un exercițiu pe cerc: întâi grupa musculară, apoi mișcarea.",
  "Time each set, dial in reps and kg, and tap how many reps you had left (RIR).":
    "Cronometrează fiecare serie, setează repetările și kg și atinge câte repetări îți mai rămâneau (RIR).",
  "This body map then shows each muscle's fatigue and recovery; History keeps every session and can send it to Claude for a review.":
    "Harta corpului arată apoi oboseala și recuperarea fiecărui mușchi; Istoricul păstrează fiecare sesiune și o poate trimite la Claude pentru o analiză.",
  "Your bodyweight (optional)": "Greutatea ta (opțional)",
  "Bodyweight (kg)": "Greutate corporală (kg)",
  "No account, no cloud: everything stays on this device. Back it up from Settings (⚙).":
    "Fără cont, fără cloud: totul rămâne pe acest dispozitiv. Fă o copie de rezervă din Setări (⚙).",
  "▶ Start first session": "▶ Pornește prima sesiune",
  "Got it": "Am înțeles",
});

const KEY = "gymlog.onboarded";

/** Whether the welcome card has already been dismissed on this device. */
export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Best effort — at worst the card shows again next launch.
  }
}

/**
 * The welcome card. `onStart` begins the first session; `onDismiss` swaps the
 * card for whatever the host shows instead. Both save a bodyweight typed in.
 */
export function renderWelcome(onStart: () => void, onDismiss: () => void): HTMLElement {
  const bw = latestBodyweight();
  const bwInput = h("input", {
    class: "plan-name-input oneRm-input",
    type: "number",
    inputmode: "decimal",
    min: "0",
    step: "0.5",
    placeholder: "kg",
    ...(bw ? { value: String(bw.kg) } : {}),
    aria: { label: t("Bodyweight (kg)") },
  });
  const finish = (next: () => void): void => {
    const kg = Number(bwInput.value);
    if (bwInput.value.trim() !== "" && Number.isFinite(kg) && kg > 0) logBodyweight(kg);
    markOnboarded();
    next();
  };
  const steps = [
    "Start a session and pick an exercise on the ring: muscle group first, then the movement.",
    "Time each set, dial in reps and kg, and tap how many reps you had left (RIR).",
    "This body map then shows each muscle's fatigue and recovery; History keeps every session and can send it to Claude for a review.",
  ];
  return h("section", { class: "card welcome-card" }, [
    h("p", { class: "eyebrow", text: t("Welcome to Gym Log") }),
    h("h2", { class: "welcome-title", text: t("Log your sets — the app reads back what they did to you.") }),
    h(
      "ol",
      { class: "welcome-steps" },
      steps.map((s) => h("li", { text: t(s) })),
    ),
    h("label", { class: "welcome-bw" }, [
      h("span", { class: "settings-label", text: t("Your bodyweight (optional)") }),
      bwInput,
    ]),
    h("p", {
      class: "plan-meta plan-note",
      text: t("No account, no cloud: everything stays on this device. Back it up from Settings (⚙)."),
    }),
    h("div", { class: "btn-row" }, [
      h("button", {
        class: "btn btn-accent",
        type: "button",
        text: t("▶ Start first session"),
        on: { click: () => finish(onStart) },
      }),
      h("button", {
        class: "btn",
        type: "button",
        text: t("Got it"),
        on: { click: () => finish(onDismiss) },
      }),
    ]),
  ]);
}
