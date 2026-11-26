import { useEffect, useRef } from "react";

const stack: (() => void)[] = [];

/** While `active`, the Android back button calls `handler` (the most recently opened overlay wins). */
export function useBackHandler(active: boolean, handler: () => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    const fn = () => ref.current();
    stack.push(fn);
    return () => {
      const i = stack.lastIndexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** Runs the topmost handler. Returns false when there is nothing to close. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}