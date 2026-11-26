"use client";

import { useEffect } from "react";
import { handleBack } from "../lib/backStack";

/** Plugs the Android back button into the back stack. Renders nothing. */
export default function BackButton() {
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let cancelled = false;
    let unregister: (() => void) | undefined;

    (async () => {
      try {
        const { onBackButtonPress } = await import("@tauri-apps/api/app");
        const listener = await onBackButtonPress(async () => {
          if (handleBack()) return;
          // Nothing left to close: leave the app
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().close();
        });
        if (cancelled) listener.unregister();
        else unregister = () => listener.unregister();
      } catch (e) {
        console.warn("Back button listener unavailable", e);
      }
    })();

    return () => {
      cancelled = true;
      unregister?.();
    };
  }, []);

  return null;
}