"use client";

import { useEffect, useState } from "react";
import {
  checkForUpdate,
  dismiss,
  isDismissed,
  openExternal,
  type UpdateInfo,
} from "../lib/updates";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

/** Checks GitHub once at startup and, if a newer release exists, shows a banner. */
export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    checkForUpdate(controller.signal)
      .then((found) => {
        if (found && !isDismissed(found.version)) setUpdate(found);
      })
      .catch(() => {
        // offline, blocked, rate-limited...: no banner, and nothing to bother the user with
      });
    return () => controller.abort();
  }, []);

  if (!update) return null;

  return (
    <div
      role="status"
      // Phone: sits in the page flow right under the title bar. Wide screen: pinned above the recipe area.
      className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#2a2a2a] px-3 py-2 md:fixed md:left-64 md:right-0 md:top-0 md:z-20"
    >
      <p className="min-w-0 flex-1 text-sm leading-snug text-neutral-100">
        Update available: version {update.version}
      </p>
      <button
        type="button"
        onClick={() => openExternal(update.url).catch(() => {})}
        className={`shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 ${focusRing}`}
      >
        Download
      </button>
      <button
        type="button"
        onClick={() => {
          dismiss(update.version);
          setUpdate(null);
        }}
        aria-label="Hide this update notice"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-neutral-100 ${focusRing}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
