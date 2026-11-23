"use client";

import { useEffect, type ReactNode } from "react";

/** Small dialog over the page: a bottom sheet on a phone, centered on a wide screen. */
export default function Dialog({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Escape closes only this dialog, not the page underneath it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="fade-in absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="fade-in relative max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-white/10 bg-[#262626] p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}