import tauriConf from "../../src-tauri/tauri.conf.json";

/**
 * Update check: asks GitHub for the latest release and compares its tag with the version
 * of the app that is running. The running version is the one in src-tauri/tauri.conf.json,
 * so keep it in step with the tag of each release (tag v0.2.0 <-> "version": "0.2.0").
 */

const REPO = "moonlight-system/Mae-s-Brewery";
const DISMISSED_KEY = "maes-brewery:dismissed-update:v1";

export const CURRENT_VERSION: string = tauriConf.version;

export type UpdateInfo = {
  /** Version number shown to the user, without a leading "v" */
  version: string;
  /** Where the download button leads: the .apk itself on Android, the release page otherwise */
  url: string;
};

const insideTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** "v1.2.3" -> [1, 2, 3]. Null when the text isn't a version number. */
function parseVersion(text: string): number[] | null {
  const core = text.trim().replace(/^v/i, "").split(/[-+]/)[0];
  const parts = core.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  return parts.length > 0 && parts.every((n) => !Number.isNaN(n)) ? parts : null;
}

/** True when version `a` is strictly newer than version `b`. */
export function isNewer(a: string, b: string): boolean {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

type GithubRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  assets?: { name?: unknown; browser_download_url?: unknown }[];
};

/** The latest published release if it is newer than this app, otherwise null. */
export async function checkForUpdate(signal?: AbortSignal): Promise<UpdateInfo | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!res.ok) return null; // no release yet (404), rate limit...

  const release = (await res.json()) as GithubRelease;
  const tag = typeof release.tag_name === "string" ? release.tag_name : "";
  if (!isNewer(tag, CURRENT_VERSION)) return null;

  let url = typeof release.html_url === "string" ? release.html_url : "";
  if (/android/i.test(navigator.userAgent)) {
    const apk = release.assets?.find(
      (a) => typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk")
    );
    if (apk && typeof apk.browser_download_url === "string") url = apk.browser_download_url;
  }
  if (!url.startsWith("https://")) return null;

  return { version: tag.replace(/^v/i, ""), url };
}

/** Opens a link in the system browser (a plain link would stay inside the app's webview). */
export async function openExternal(url: string) {
  if (insideTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/* ---------- "Not now" ---------- */

export function isDismissed(version: string): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === version;
  } catch {
    return false;
  }
}

export function dismiss(version: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    // not saved: the banner will simply come back next time
  }
}
