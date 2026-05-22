import { h } from "../dom";
import { round2 } from "../util";

export interface NumberFieldOpts {
  label: string;
  value: number;
  step: number;
  min: number;
  integer: boolean;
  onCommit: (value: number) => void;
}

/** A labelled −/＋ stepper around a numeric text input. */
export function numberField(opts: NumberFieldOpts): HTMLElement {
  const { label, step, min, integer, onCommit } = opts;
  let current = opts.value;

  const input = h("input", {
    class: "num-input",
    type: "text",
    inputmode: integer ? "numeric" : "decimal",
    value: String(current),
    aria: { label },
  });

  const normalize = (n: number): number => round2(integer ? Math.round(n) : n);

  const commit = (n: number, reflect: boolean): void => {
    current = Math.max(min, normalize(n));
    if (reflect) input.value = String(current);
    onCommit(current);
  };

  input.addEventListener("input", () => {
    const n = parseFloat(input.value);
    if (Number.isFinite(n)) commit(n, false);
  });
  input.addEventListener("change", () => {
    const n = parseFloat(input.value);
    commit(Number.isFinite(n) ? n : min, true);
  });

  const dec = h("button", {
    class: "stepper",
    type: "button",
    text: "−",
    aria: { label: `decrease ${label}` },
    on: { click: () => commit(current - step, true) },
  });
  const inc = h("button", {
    class: "stepper",
    type: "button",
    text: "+",
    aria: { label: `increase ${label}` },
    on: { click: () => commit(current + step, true) },
  });

  return h("label", { class: "field" }, [
    h("span", { class: "field-label", text: label }),
    h("div", { class: "stepper-row" }, [dec, input, inc]),
  ]);
}
