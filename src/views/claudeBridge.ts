/**
 * UI shared by Fuel's Claude panels: sending a prompt out (share sheet → the
 * Claude app, or claude.ai pre-filled) and reading the reply back (paste, or a
 * reply shared into the installed PWA). No API, no key — see CLAUDE.md.
 */
import { canReadClipboard, copyText, readText } from "../clipboard";
import { append, clear, h } from "../dom";
import { claudeChatUrl, clearSharedReply, peekSharedReply } from "../health/cutClaude";
import { replyKind } from "../health/suppClaude";
import { registerTranslations, t } from "../i18n";
import { hasNativeShare, nativeShare } from "../nativeShare";

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
  "Prompt copied — paste it in Claude next to the photo.":
    "Prompt copiat — lipește-l în Claude lângă fotografie.",
  "If Claude shows only the photo, tap Copy prompt and paste it there.":
    "Dacă Claude arată doar fotografia, apasă Copiază prompt și lipește-l acolo.",
  "Prompt copied — attach the photo in Claude and paste the prompt.":
    "Prompt copiat — atașează fotografia în Claude și lipește promptul.",
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
  'No supplement found — the reply needs the JSON block with "supplements", each with name, dose and unit.':
    "Nu s-a găsit niciun supliment — răspunsul trebuie să conțină blocul JSON cu „supplements”, fiecare cu name, dose și unit.",
  "Take photo": "Fă o fotografie",
  "Retake photo": "Refă fotografia",
  "Choose photo": "Alege o fotografie",
  "Change photo": "Schimbă fotografia",
  "Remove photo": "Elimină fotografia",
  'No menu found — the reply needs the JSON block with "meals", each with its items.':
    "Nu s-a găsit niciun meniu — răspunsul trebuie să conțină blocul JSON cu „meals”, fiecare cu alimentele sale.",
});

const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";


/** A status line that clears itself. */
export function flashLine(): { el: HTMLElement; say: (msg: string) => void } {
  const el = h("p", { class: "plan-meta plan-note hl-flash", role: "status" });
  let timer = 0;
  return {
    el,
    say(msg: string) {
      el.textContent = msg;
      clearTimeout(timer);
      // Long instructions (paste the prompt next to the photo) stay up longer.
      timer = window.setTimeout(() => (el.textContent = ""), Math.max(2600, msg.length * 80));
    },
  };
}

/**
 * A reply shared into the installed app, if it belongs to this kind of panel
 * (a supplement read goes to Supps, a menu reply to the menu planner,
 * anything else to the meal estimate).
 * Taken once, then forgotten.
 */
export function takeSharedReply(kind: "supps" | "menu" | "meal"): string | null {
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

/**
 * Share sheet → Claude app where available (the native sheet in the app, the
 * Web Share API in a browser); claude.ai (pre-filled, prompt also copied)
 * otherwise.
 *
 * With a photo attached, the Claude app takes the image and drops the text
 * that rides along with it, so the prompt is copied to the clipboard as the
 * sheet opens and the person pastes it next to the photo.
 */
export function sendRow(opts: {
  prompt: () => string;
  photo?: () => File | null;
  say: (msg: string) => void;
}): { el: HTMLElement; setDisabled: (d: boolean) => void } {
  const native = hasNativeShare();
  const shareable = native || canShare;
  const openWeb = async (): Promise<void> => {
    const prompt = opts.prompt();
    const copied = await copyText(prompt);
    window.open(claudeChatUrl(prompt), "_blank", "noopener");
    if (copied) opts.say(t("Prompt copied — paste it if the chat opens empty."));
  };
  const send = async (): Promise<void> => {
    const prompt = opts.prompt();
    const photo = opts.photo?.() ?? null;
    if (!shareable) {
      await openWeb();
      if (photo) opts.say(t("Prompt copied — attach the photo in Claude and paste the prompt."));
      return;
    }
    // Copy before the sheet opens. In a browser the copy needs the tap's user
    // activation and the sheet needs it too, so it's started, not awaited; the
    // native clipboard needs neither, so it's finished before the app switches.
    const copying = photo ? copyText(prompt) : Promise.resolve(false);
    if (native && photo) await copying;
    try {
      if (native) {
        if ((await nativeShare({ text: prompt, file: photo })) === "cancelled") return;
      } else {
        const withFile: ShareData | null = photo ? { text: prompt, files: [photo] } : null;
        const data: ShareData = withFile && navigator.canShare?.(withFile) ? withFile : { text: prompt };
        await navigator.share(data);
        if (photo && data !== withFile) {
          opts.say(t("This browser can't share photos — attach it in Claude."));
          return;
        }
      }
      if (photo)
        opts.say(
          (await copying)
            ? t("Prompt copied — paste it in Claude next to the photo.")
            : t("If Claude shows only the photo, tap Copy prompt and paste it there."),
        );
    } catch (e) {
      if ((e as DOMException | null)?.name !== "AbortError") void openWeb();
    }
  };
  const buttons = [
    h("button", {
      class: "btn btn-small btn-accent",
      type: "button",
      text: shareable ? t("Send to Claude") : t("Open Claude"),
      on: { click: () => void send() },
    }),
    shareable
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

/**
 * A phone photo scaled down for sharing (longest side ≤ 1600 px, JPEG): a
 * 10 MB camera shot shares slowly and some apps refuse it, and Claude reads a
 * plate just as well at this size. Falls back to the original on any failure.
 */
export async function shrinkPhoto(file: File, maxSide = 1600, prefix = "meal"): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000 && file.type === "image/jpeg") {
      bmp.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], `${prefix}-${Date.now().toString(36)}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Take a photo (camera straight away) or choose one already taken, with a
 * thumbnail and a remove button. The photo itself is held by the caller
 * (`get`/`set`) so it survives the panel being rebuilt.
 */
export function photoPicker(opts: {
  get: () => File | null;
  set: (f: File | null) => void;
  /** File name prefix for the shrunk JPEG. */
  prefix?: string;
}): HTMLElement {
  const cameraInput = h("input", { type: "file", accept: "image/*", class: "hl-hidden-file" });
  cameraInput.setAttribute("capture", "environment");
  const galleryInput = h("input", { type: "file", accept: "image/*", class: "hl-hidden-file" });
  const row = h("div", { class: "hl-photo-row" });
  let thumbUrl: string | null = null;
  const paint = (): void => {
    const photo = opts.get();
    clear(row);
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = photo ? URL.createObjectURL(photo) : null;
    const thumb = thumbUrl ? h("img", { class: "hl-photo-thumb", aria: { hidden: "true" } }) : null;
    if (thumb && thumbUrl) thumb.src = thumbUrl;
    append(row, [
      thumb,
      h("div", { class: "btn-row" }, [
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: photo ? t("Retake photo") : t("Take photo"),
          on: { click: () => cameraInput.click() },
        }),
        h("button", {
          class: "btn btn-small",
          type: "button",
          text: photo ? t("Change photo") : t("Choose photo"),
          on: { click: () => galleryInput.click() },
        }),
        photo
          ? h("button", {
              class: "btn btn-small",
              type: "button",
              text: `✕ ${t("Remove photo")}`,
              on: {
                click: () => {
                  opts.set(null);
                  paint();
                },
              },
            })
          : null,
      ]),
      cameraInput,
      galleryInput,
    ]);
  };
  const take = (input: HTMLInputElement): void => {
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!file) return;
    void shrinkPhoto(file, 1600, opts.prefix).then((small) => {
      opts.set(small);
      paint();
    });
  };
  cameraInput.addEventListener("change", () => take(cameraInput));
  galleryInput.addEventListener("change", () => take(galleryInput));
  paint();
  return row;
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
      canReadClipboard()
        ? h("button", {
            class: "btn btn-small btn-primary",
            type: "button",
            text: t("Paste reply"),
            on: {
              click: () =>
                void readText().then(set, () => {
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
