import { clear, h } from "../dom";
import { registerTranslations, t } from "../i18n";
import { isNativeApp, requestNotifyPermission } from "../notify";
import {
  loadNotifyPrefs,
  REMINDER_HOUR_OPTIONS,
  saveNotifyPrefs,
  sendTestNotification,
  syncReminders,
  TEST_DELAY_SEC,
  TRAIN_AFTER_OPTIONS,
  type NotifyPrefs,
} from "../reminders";

registerTranslations({
  Notifications: "Notificări",
  "Rest alerts and reminders are ordinary phone notifications, so a paired watch such as a Fitbit Versa shows them on your wrist.":
    "Alertele de pauză și mementourile sunt notificări obișnuite ale telefonului, așa că un ceas asociat, precum un Fitbit Versa, le afișează pe încheietură.",
  "Recovery ready": "Recuperare completă",
  "Time to train after": "Antrenament după",
  "Reminder time": "Ora mementoului",
  Off: "Oprit",
  On: "Pornit",
  "{0}d": "{0}z",
  "Send test notification": "Trimite o notificare de test",
  "Sent — it arrives in {0} s. Lock the phone and check your watch.":
    "Trimisă — sosește în {0} s. Blochează telefonul și verifică ceasul.",
  "Notifications are blocked. Allow them for Gym Log in the phone's settings.":
    "Notificările sunt blocate. Permite-le pentru Gym Log în setările telefonului.",
  "On a Fitbit Versa: in the Fitbit app, tap your watch → Notifications → App notifications and switch on Gym Log. Keep the watch connected, and Do Not Disturb and Sleep mode off.":
    "Pe un Fitbit Versa: în aplicația Fitbit, atinge ceasul → Notificări → Notificări aplicații și activează Gym Log. Ține ceasul conectat, iar Nu deranja și Modul somn oprite.",
  "Reminders need the Android or iOS app. In a browser only the rest alert and the test fire, posted under the browser's name — switch the browser on in the Fitbit app.":
    "Mementourile necesită aplicația Android sau iOS. Într-un browser doar alerta de pauză și testul funcționează, afișate sub numele browserului — activează browserul în aplicația Fitbit.",
});

/**
 * The Settings sheet's Notifications block: reminder toggles, a test button
 * and how to get them onto a Fitbit Versa. Paints into `row`; returns a
 * repaint for language changes.
 */
export function mountNotifySettings(row: HTMLElement): () => void {
  const native = isNativeApp();
  let prefs = loadNotifyPrefs();
  let status = "";

  const update = (patch: Partial<NotifyPrefs>): void => {
    const turningOn =
      (patch.recovery === true && !prefs.recovery) ||
      (patch.trainAfterDays !== undefined && patch.trainAfterDays > 0 && prefs.trainAfterDays === 0);
    prefs = { ...prefs, ...patch };
    saveNotifyPrefs(prefs);
    paint();
    // Ask on the gesture that switches a reminder on, then schedule.
    const ready = turningOn ? requestNotifyPermission() : Promise.resolve(true);
    void ready.then(() => syncReminders());
  };

  function stamp<T>(
    label: string,
    options: readonly T[],
    current: T,
    text: (v: T) => string,
    pick: (v: T) => void,
  ): HTMLElement {
    return h("div", { class: "notify-pref" }, [
      h("span", { class: "plan-meta", text: label }),
      h(
        "div",
        { class: "mode-toggle notify-toggle", role: "group", aria: { label } },
        options.map((v) =>
          h("button", {
            class: v === current ? "mode-toggle-btn active" : "mode-toggle-btn",
            type: "button",
            text: text(v),
            aria: { pressed: String(v === current) },
            on: { click: () => v !== current && pick(v) },
          }),
        ),
      ),
    ]);
  }

  function paint(): void {
    clear(row);
    const testBtn = h("button", {
      class: "btn btn-small",
      type: "button",
      text: t("Send test notification"),
    });
    testBtn.addEventListener("click", () => {
      testBtn.disabled = true;
      void sendTestNotification().then((ok) => {
        status = ok
          ? t("Sent — it arrives in {0} s. Lock the phone and check your watch.").replace(
              "{0}",
              String(TEST_DELAY_SEC),
            )
          : t("Notifications are blocked. Allow them for Gym Log in the phone's settings.");
        paint();
      });
    });

    row.append(
      h("span", { class: "settings-label", text: t("Notifications") }),
      h("p", {
        class: "settings-disclaimer",
        text: t(
          "Rest alerts and reminders are ordinary phone notifications, so a paired watch such as a Fitbit Versa shows them on your wrist.",
        ),
      }),
    );
    if (native) {
      row.append(
        stamp(t("Recovery ready"), [false, true], prefs.recovery, (v) => t(v ? "On" : "Off"), (v) =>
          update({ recovery: v }),
        ),
        stamp(
          t("Time to train after"),
          TRAIN_AFTER_OPTIONS,
          prefs.trainAfterDays,
          (d) => (d === 0 ? t("Off") : t("{0}d").replace("{0}", String(d))),
          (d) => update({ trainAfterDays: d }),
        ),
      );
      if (prefs.trainAfterDays > 0) {
        row.append(
          stamp(
            t("Reminder time"),
            REMINDER_HOUR_OPTIONS,
            prefs.hour,
            (hr) => `${String(hr).padStart(2, "0")}:00`,
            (hr) => update({ hour: hr }),
          ),
        );
      }
    }
    row.append(
      testBtn,
      ...(status ? [h("p", { class: "settings-disclaimer settings-build", text: status })] : []),
      h("p", {
        class: "settings-disclaimer settings-build",
        text: t(
          "On a Fitbit Versa: in the Fitbit app, tap your watch → Notifications → App notifications and switch on Gym Log. Keep the watch connected, and Do Not Disturb and Sleep mode off.",
        ),
      }),
    );
    if (!native) {
      row.append(
        h("p", {
          class: "settings-disclaimer",
          text: t(
            "Reminders need the Android or iOS app. In a browser only the rest alert and the test fire, posted under the browser's name — switch the browser on in the Fitbit app.",
          ),
        }),
      );
    }
  }

  paint();
  return paint;
}
