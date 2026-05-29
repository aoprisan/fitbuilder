import { h } from "../dom";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  "Number of recent sessions to analyse": "Numărul de sesiuni recente de analizat",
  "Analyze the last ": "Analizează ultimele ",
  " sessions": " sesiuni",
});

export interface LookbackControl {
  field: HTMLElement;
  /** The most-recent N sessions from a chronological (oldest-first) list. */
  pick<T>(chronological: T[]): T[];
}

const DEFAULT_LOOKBACK = 10;
const MAX_LOOKBACK = 20;

/**
 * A range slider choosing how many of the most recent sessions to hand to an AI
 * for analysis: defaults to 10, caps at 20 (or however many exist). Returns the
 * field plus `pick()`, which slices the latest N off a chronological list.
 */
export function lookbackSlider(available: number): LookbackControl {
  const max = Math.min(MAX_LOOKBACK, available);
  let value = Math.min(DEFAULT_LOOKBACK, max);

  const valueEl = h("span", { class: "lookback-value", text: String(value) });
  const slider = h("input", {
    class: "lookback-slider",
    type: "range",
    min: "1",
    max: String(max),
    step: "1",
    value: String(value),
    aria: { label: t("Number of recent sessions to analyse") },
  });
  slider.addEventListener("input", () => {
    value = Number(slider.value);
    valueEl.textContent = String(value);
  });

  const field = h("label", { class: "field lookback-field" }, [
    h("span", { class: "field-label" }, [t("Analyze the last "), valueEl, t(" sessions")]),
    slider,
  ]);

  return {
    field,
    pick<T>(chronological: T[]): T[] {
      return chronological.slice(-value);
    },
  };
}
