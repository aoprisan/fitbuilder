/**
 * UI shared by Fuel's Claude panels: sending a prompt out (share sheet → the
 * Claude app, or claude.ai pre-filled) and reading the reply back (paste, or a
 * reply shared into the installed PWA). No API, no key — see CLAUDE.md.
 */
import { h } from "../dom";
import { claudeChatUrl, clearSharedReply, peekSharedReply, replyKind } from "../health/cutClaude";
import { registerTranslations, t } from "../i18n";

registerTranslations({
  "Send to Claude": "Trimite la Claude",
  "Open Claude": "Deschide Claude",
  "claude.ai": "claude.ai",
  "Copy prompt": "Copiază prompt",
  "Prompt copied.": "Prompt copiat.",
  "Couldn't copy.": "Nu s-a putut copia.",
  "Prompt copied — paste it if the chat opens empty.":
    "Prompt copiat — lipește-l dacă conversația se deschide goală.",
  "This browser can't share photos — attach it in Claude.":
    "Acest browser nu poate partaja fotografii — atașeaz-o în Claude.",
  "Paste reply": "Lipește răspunsul",
  "Clear reply": "Golește",
  Reply: "Răspuns",
  "The whole answer is fine — the JSON block is picked out.":
    "Răspunsul întreg e în regulă — blocul JSON este extras automat.",
  "Couldn't read the clipboard — long-press the box below and paste.":
    "Nu s-a putut citi clipboardul — apasă lung în caseta de mai jos și lipește.",
  "On Android, with this app installed, you can share Claude's answer straight back to it.":
    "Pe Android, cu aplicația instalată, poți partaja răspunsul lui Claude direct înapoi în ea.",
  "Paste Claude's reply first.": "Lipește mai întâi răspunsul lui Claude.",
  "No meal found — the reply needs the JSON block with name, g and kcal.":
    "Nu s-a găsit nicio masă — răspunsul trebuie să conțină blocul JSON cu name, g și kcal.",
  'No menu found — the reply needs the JSON block with "meals", each with its items.':
    "Nu s-a găsit niciun meniu — răspunsul trebuie să conțină blocul JSON cu „meals”, fiecare cu alimentele sale.",
});

const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
const canReadClipboard =
  typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A status line that clears itself. */
export function flashLine(): { el: HTMLElement; say: (msg: string) => void } {
  const el = h("p", { class: "plan-meta plan-note hl-flash", role: "status" });
  let timer = 0;
  return {
    el,
    say(msg: string) {
      el.textContent = msg;
      clearTimeout(timer);
      timer = window.setTimeout(() => (el.textContent = ""), 2600);
    },
  };
}

/**
 * A reply shared into the installed app, if it belongs to this kind of panel
 * (a menu reply goes to the menu planner, anything else to the meal estimate).
 * Taken once, then forgotten.
 */
export function takeSharedReply(kind: "menu" | "meal"): string | null {
  const text = peekSharedReply();
  if (text === null || replyKind(text) !== kind) return null;
  clearSharedReply();
  return text;
}

/** Text kept in sessionStorage so it survives the trip to the Claude app and back. */
export function sessionDraft(key: string): { get: () => string; set: (v: string) => void } {
  return {
    get() {
      try {
        return sessionStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    set(v: string) {
      try {
        if (v) sessionStorage.setItem(key, v);
        else sessionStorage.removeItem(key);
      } catch {
        // storage blocked — the draft just won't survive a reload
      }
    },
  };
}

/** Share sheet → Claude app where available; claude.ai (pre-filled, prompt also copied) otherwise. */
export function sendRow(opts: {
  prompt: () => string;
  photo?: () => File | null;
  say: (msg: string) => void;
}): { el: HTMLElement; setDisabled: (d: boolean) => void } {
  const openWeb = async (): Promise<void> => {
    const prompt = opts.prompt();
    const copied = await copyText(prompt);
    window.open(claudeChatUrl(prompt), "_blank", "noopener");
    if (copied) opts.say(t("Prompt copied — paste it if the chat opens empty."));
  };
  const send = async (): Promise<void> => {
    if (!canShare) return openWeb();
    const prompt = opts.prompt();
    const photo = opts.photo?.() ?? null;
    const withFile: ShareData | null = photo ? { text: prompt, files: [photo] } : null;
    const data: ShareData = withFile && navigator.canShare?.(withFile) ? withFile : { text: prompt };
    try {
      await navigator.share(data);
      if (photo && data !== withFile) opts.say(t("This browser can't share photos — attach it in Claude."));
    } catch (e) {
      if ((e as DOMException | null)?.name !== "AbortError") void openWeb();
    }
  };
  const buttons = [
    h("button", {
      class: "btn btn-small btn-accent",
      type: "button",
      text: canShare ? t("Send to Claude") : t("Open Claude"),
      on: { click: () => void send() },
    }),
    canShare
      ? h("button", { class: "btn btn-small", type: "button", text: t("claude.ai"), on: { click: () => void openWeb() } })
      : null,
    h("button", {
      class: "btn btn-small",
      type: "button",
      text: t("Copy prompt"),
      on: {
        click: () =>
          void copyText(opts.prompt()).then((ok) => opts.say(ok ? t("Prompt copied.") : t("Couldn't copy."))),
      },
    }),
  ].filter((b): b is HTMLButtonElement => b !== null);
  return {
    el: h("div", { class: "btn-row" }, buttons),
    setDisabled(d: boolean) {
      for (const b of buttons) b.disabled = d;
    },
  };
}

/** Paste button, the reply box and the parse error line. */
export function replyBox(opts: {
  initial: string;
  onReply: (text: string) => void;
}): { el: HTMLElement; set: (text: string) => void; setError: (msg: string | null) => void } {
  const area = h("textarea", {
    class: "hl-textarea",
    rows: "3",
    placeholder: t("The whole answer is fine — the JSON block is picked out."),
    aria: { label: t("Reply") },
  });
  area.value = opts.initial;
  area.addEventListener("input", () => opts.onReply(area.value));
  const error = h("p", { class: "plan-meta plan-note hl-error", role: "alert" });
  const set = (text: string): void => {
    area.value = text;
    opts.onReply(text);
  };
  const el = h("div", { class: "hl-reply" }, [
    h("div", { class: "btn-row" }, [
      canReadClipboard
        ? h("button", {
            class: "btn btn-small btn-primary",
            type: "button",
            text: t("Paste reply"),
            on: {
              click: () =>
                void navigator.clipboard.readText().then(set, () => {
                  error.textContent = t("Couldn't read the clipboard — long-press the box below and paste.");
                }),
            },
          })
        : null,
      h("button", { class: "btn btn-small", type: "button", text: t("Clear reply"), on: { click: () => set("") } }),
    ]),
    area,
    error,
    h("p", {
      class: "plan-meta plan-note",
      text: t("On Android, with this app installed, you can share Claude's answer straight back to it."),
    }),
  ]);
  return {
    el,
    set,
    setError(msg: string | null) {
      error.textContent = msg === null ? "" : t(msg);
    },
  };
}
