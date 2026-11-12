/**
 * The OS share sheet inside the native app. Android's WebView has no
 * `navigator.share`, so without this the Claude handoff could only open
 * claude.ai and a meal photo was silently dropped. `@capacitor/share` takes
 * files as file:// URIs, so a photo is written to the cache first
 * (`@capacitor/filesystem`). Both plugins are lazy-loaded and boxed: plugin
 * objects are Proxies that look like thenables (see CLAUDE.md, Gotchas).
 * No-ops in a browser — callers use the Web Share API there.
 */
import { Capacitor } from "@capacitor/core";
import type { Directory, FilesystemPlugin } from "@capacitor/filesystem";
import type { SharePlugin } from "@capacitor/share";

export const hasNativeShare = (): boolean => Capacitor.isNativePlatform();

type Plugins = { share: SharePlugin; fs: FilesystemPlugin; cache: Directory };
let pluginsP: Promise<Plugins> | null = null;

function plugins(): Promise<Plugins> {
  pluginsP ??= Promise.all([import("@capacitor/share"), import("@capacitor/filesystem")]).then(([s, f]) => ({
    share: s.Share,
    fs: f.Filesystem,
    cache: f.Directory.Cache,
  }));
  return pluginsP;
}

function base64Of(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

/**
 * Share text (and optionally one file) through the native sheet. Resolves
 * "cancelled" when the person dismisses the sheet.
 */
export async function nativeShare(data: {
  text: string;
  file?: File | null;
  /** Write the file under its own name (a report the receiving app shows by name) rather than a throwaway one. */
  keepName?: boolean;
}): Promise<"shared" | "cancelled"> {
  const { share, fs, cache } = await plugins();
  let files: string[] | undefined;
  if (data.file) {
    const ext = /\.(\w{2,5})$/.exec(data.file.name)?.[1] ?? "jpg";
    const written = await fs.writeFile({
      path: data.keepName
        ? `share/${data.file.name.replace(/[^\w.-]+/g, "-")}`
        : `share/meal-${Date.now().toString(36)}.${ext}`,
      data: await base64Of(data.file),
      directory: cache,
      recursive: true,
    });
    files = [written.uri];
  }
  try {
    await share.share(files ? { text: data.text, files } : { text: data.text });
    return "shared";
  } catch (e) {
    if (/cancel/i.test(String((e as Error | null)?.message ?? e))) return "cancelled";
    throw e;
  }
}
