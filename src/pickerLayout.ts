/**
 * How the live exercise picker is laid out: the concentric ring dial
 * ("rings", the default) or the classic stacked chip lists ("list"). A device
 * preference like the theme — some lifters want every option visible and
 * filterable, and the rings trade that for one-thumb reach.
 */

const KEY = "gymlog.pickerLayout";

export const PICKER_LAYOUTS = ["rings", "list"] as const;
export type PickerLayout = (typeof PICKER_LAYOUTS)[number];

/** The saved picker layout; rings unless the user pinned the list. */
export function loadPickerLayout(): PickerLayout {
  try {
    return localStorage.getItem(KEY) === "list" ? "list" : "rings";
  } catch {
    return "rings";
  }
}

export function savePickerLayout(layout: PickerLayout): void {
  try {
    localStorage.setItem(KEY, layout);
  } catch {
    // Quota or privacy-mode failure: the choice just won't persist.
  }
}
