import { h } from "../dom";
import { HEIGHT_RANGE, loadBody, saveBody, WEIGHT_RANGE, type Sex } from "../health/bodyProfile";
import { widmarkR } from "../health/metabolism";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  "Height (cm)": "Înălțime (cm)",
  "Weight (kg)": "Greutate (kg)",
  Build: "Constituție",
  Female: "Feminin",
  Male: "Masculin",
  Unsaid: "Nespecificat",
  "Height should be between 50 and 260 cm.": "Înălțimea trebuie să fie între 50 și 260 cm.",
  "Weight should be between 20 and 400 kg.": "Greutatea trebuie să fie între 20 și 400 kg.",
  "Saved.": "Salvat.",
  Save: "Salvează",
  "Shared by every tab: weight sharpens the protein and calorie estimates and joins the Fuel weigh-ins; height and build let Water estimate blood alcohol and Fuel your waist-to-height.":
    "Comune tuturor filelor: greutatea îmbunătățește estimările de proteine și calorii și apare la cântăririle din Nutriție; înălțimea și constituția permit filei Apă să estimeze alcoolemia, iar filei Nutriție raportul talie-înălțime.",
  "Widmark r ≈ {0}": "Widmark r ≈ {0}",
});

const SEXES: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Unsaid" },
];

function parseMeasure(raw: string, [min, max]: readonly [number, number]): number | null {
  const n = Number(raw.replace(",", "."));
  if (raw.trim() === "" || !Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 10) / 10;
}

export interface MeasuresForm {
  el: HTMLElement;
  /** Re-read the stored measures into the fields (e.g. after a weigh-in elsewhere). */
  repaint(): void;
}

/**
 * Height, weight and build — one form used in Settings, on Water's alcohol
 * card and on Fuel. Weight writes to the shared body-weight log.
 */
export function measuresForm(opts: { onSaved?: () => void; withNote?: boolean } = {}): MeasuresForm {
  const height = h("input", {
    type: "number",
    inputmode: "decimal",
    min: String(HEIGHT_RANGE[0]),
    max: String(HEIGHT_RANGE[1]),
    step: "0.5",
    placeholder: "cm",
    aria: { label: t("Height (cm)") },
  });
  const weight = h("input", {
    type: "number",
    inputmode: "decimal",
    min: String(WEIGHT_RANGE[0]),
    max: String(WEIGHT_RANGE[1]),
    step: "0.1",
    placeholder: "kg",
    aria: { label: t("Weight (kg)") },
  });
  let sex: Sex = "unspecified";
  const sexButtons = SEXES.map((s) =>
    h("button", {
      class: "toggle-btn",
      type: "button",
      text: t(s.label),
      role: "radio",
      on: {
        click: () => {
          sex = s.value;
          paintSex();
        },
      },
    }),
  );
  const paintSex = (): void =>
    sexButtons.forEach((b, i) => {
      const on = SEXES[i]?.value === sex;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  const status = h("p", { class: "plan-meta plan-note", aria: { live: "polite" } });

  function repaint(): void {
    const body = loadBody();
    height.value = body.heightCm === null ? "" : String(body.heightCm);
    weight.value = body.weightKg === null ? "" : String(body.weightKg);
    sex = body.sex;
    paintSex();
    const r = widmarkR(body);
    status.textContent = r === null ? "" : t("Widmark r ≈ {0}").replace("{0}", r.toFixed(2));
  }

  const save = h("button", {
    class: "btn btn-small",
    type: "button",
    text: t("Save"),
    on: {
      click: () => {
        const hv = parseMeasure(height.value, HEIGHT_RANGE);
        const wv = parseMeasure(weight.value, WEIGHT_RANGE);
        if (height.value.trim() !== "" && hv === null) {
          status.textContent = t("Height should be between 50 and 260 cm.");
          return;
        }
        if (weight.value.trim() !== "" && wv === null) {
          status.textContent = t("Weight should be between 20 and 400 kg.");
          return;
        }
        saveBody({ heightCm: hv, sex, ...(wv !== null ? { weightKg: wv } : {}) });
        repaint();
        status.textContent = `${t("Saved.")} ${status.textContent ?? ""}`.trim();
        opts.onSaved?.();
      },
    },
  });

  const el = h("div", { class: "hl-measures" }, [
    opts.withNote
      ? h("p", {
          class: "plan-meta plan-note",
          text: t(
            "Shared by every tab: weight sharpens the protein and calorie estimates and joins the Fuel weigh-ins; height and build let Water estimate blood alcohol and Fuel your waist-to-height.",
          ),
        })
      : null,
    h("div", { class: "hl-measures-fields" }, [
      h("label", { class: "field" }, [h("span", { class: "field-label", text: t("Height (cm)") }), height]),
      h("label", { class: "field" }, [h("span", { class: "field-label", text: t("Weight (kg)") }), weight]),
    ]),
    h("div", { class: "field" }, [
      h("span", { class: "field-label", text: t("Build") }),
      h("div", { class: "toggle hl-toggle", role: "radiogroup", aria: { label: t("Build") } }, sexButtons),
    ]),
    h("div", { class: "btn-row" }, [save]),
    status,
  ]);
  repaint();
  return { el, repaint };
}
