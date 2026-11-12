import { h } from "../dom";
import type { ShareFormat, ShareResult } from "../exporters";
import { registerTranslations, t } from "../i18n";
import { exportStatus, type ExportStatus } from "./exportStatus";

registerTranslations({
  "Share PNG ▸": "Trimite PNG ▸",
  "Share PDF ▸": "Trimite PDF ▸",
  "Full report PDF ▸": "Raport complet PDF ▸",
  "Share as an image or a PDF — pick WhatsApp or any other app.":
    "Trimite ca imagine sau PDF — alege WhatsApp sau orice altă aplicație.",
  "Opened the share sheet — pick WhatsApp or any other app.":
    "S-a deschis meniul de partajare — alege WhatsApp sau altă aplicație.",
  "Sharing isn't available here, so the file was downloaded instead.":
    "Partajarea nu e disponibilă aici, așa că fișierul a fost descărcat.",
  "One PDF with everything: the body figure, training history, the latest session, water and food.":
    "Un singur PDF cu tot: figura corpului, istoricul antrenamentelor, ultima sesiune, apa și mâncarea.",
});

/** The status line after a share: the sheet opened, or the file was downloaded instead. */
export function shareMsg(result: ShareResult): string {
  return result === "shared"
    ? t("Opened the share sheet — pick WhatsApp or any other app.")
    : t("Sharing isn't available here, so the file was downloaded instead.");
}

/** One share button driven through a (shared) export status line. */
export function shareButton(
  status: ExportStatus,
  label: string,
  share: () => Promise<ShareResult>,
  opts: { accent?: boolean; ariaLabel?: string } = {},
): HTMLElement {
  return h("button", {
    class: `btn btn-small${opts.accent ? " btn-accent" : ""}`,
    type: "button",
    text: t(label),
    ...(opts.ariaLabel ? { aria: { label: opts.ariaLabel } } : {}),
    on: {
      click: () =>
        void status.run(label, async () => shareMsg(await share())),
    },
  });
}

/**
 * "Share PNG ▸ · Share PDF ▸" with its own status line — the share row under a
 * day or a history. `share` renders the page and hands it to the share sheet.
 */
export function shareRow(share: (format: ShareFormat) => Promise<ShareResult>, note = true): HTMLElement {
  const status = exportStatus();
  return h("div", { class: "share-row" }, [
    note
      ? h("p", { class: "plan-meta plan-note", text: t("Share as an image or a PDF — pick WhatsApp or any other app.") })
      : null,
    h("div", { class: "btn-row" }, [
      shareButton(status, "Share PNG ▸", () => share("png"), { accent: true }),
      shareButton(status, "Share PDF ▸", () => share("pdf")),
    ]),
    status.el,
  ]);
}
