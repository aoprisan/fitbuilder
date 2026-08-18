import { h } from "../dom";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  "Filter…": "Filtrează…",
});

/**
 * Shared list-filter input — the one search affordance every long list uses
 * (saved sheets, the student library, the live exercise chips), so they all
 * read and behave identically. The caller re-paints its list on each keystroke;
 * the input itself is never re-created, so it keeps focus while typing.
 */
export function filterField(label: string, onChange: (query: string) => void): HTMLInputElement {
  const input = h("input", {
    class: "filter-input",
    type: "search",
    placeholder: t("Filter…"),
    aria: { label },
  });
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

/** Case-insensitive substring match, with an empty query matching everything. */
export function matchesFilter(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || text.toLowerCase().includes(q);
}
