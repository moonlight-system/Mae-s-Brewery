/**
 * Getting the exported JSON out of the app.
 *
 * - Inside the Tauri app, a real "save as" dialog is used (tauri-plugin-dialog) and the file
 *   is written with tauri-plugin-fs. The Android webview ignores normal browser downloads,
 *   so this is the only way to produce a file there.
 * - In a regular browser (`npm run dev`), a normal download is started.
 */

export type SaveResult =
  | { kind: "saved" } // written through the native dialog
  | { kind: "downloaded" } // browser download started
  | { kind: "cancelled" } // the person closed the dialog
  | { kind: "failed"; message: string };

const insideTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function saveJsonFile(filename: string, text: string): Promise<SaveResult> {
  if (insideTauri()) {
    try {
      // Loaded only here, so the browser version never touches the native plugins
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");

      const path = await save({
        defaultPath: filename,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return { kind: "cancelled" };

      await writeTextFile(path, text);
      return { kind: "saved" };
    } catch (e) {
      // Tauri rejects with plain strings (for example a missing permission or plugin)
      const message = e instanceof Error ? e.message : String(e);
      return { kind: "failed", message };
    }
  }

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { kind: "downloaded" };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older webviews: select a hidden field and use the legacy command
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    field.remove();
    return ok;
  }
}

/** True when the system share sheet is available (not in every webview). */
export function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Opens the share sheet with the file (or the text, if files can't be shared). */
export async function shareJson(filename: string, text: string): Promise<boolean> {
  try {
    const file = new File([text], filename, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
    } else {
      await navigator.share({ title: filename, text });
    }
    return true;
  } catch (e) {
    // Closing the share sheet is not an error
    return (e as DOMException)?.name === "AbortError";
  }
}