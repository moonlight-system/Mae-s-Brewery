"use client";
import { useBackHandler } from "../lib/backStack";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

// Colors that look like drinks, so most ingredients are one tap away
const PRESETS = [
  "#FFFFFF", "#DDDDDD", "#E8F1F5", "#ADFFFF", "#CDEBFA", "#FFE159", "#FFE057",
  "#F7B56F", "#E3B46D", "#FFAE45", "#FFA600", "#FF9500", "#F09516", "#D18411",
  "#B8681A", "#9C613A", "#332406", "#2E0000", "#FF3B42", "#FF006A", "#4A075C",
  "#A4D65E", "#3FA34D", "#0F6B3A", "#2D6CDF", "#7B3FE4", "#E84393", "#888888",
];

/* ---------- Color maths ---------- */

type Hsv = { h: number; s: number; v: number }; // h: 0-360, s and v: 0-1

const clamp = (n: number) => Math.min(1, Math.max(0, n));

function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`.toUpperCase();
}

/** "#abc", "abc", "#aabbcc" or "aabbcc" -> "#AABBCC", or null if it isn't a color. */
function parseHex(text: string): string | null {
  const t = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(t)) {
    return "#" + t.split("").map((c) => c + c).join("").toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(t)) return "#" + t.toUpperCase();
  return null;
}

/** `keepHue` is used for greys, which have no hue of their own: the slider stays put. */
function hexToHsv(hex: string, keepHue = 0): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);

  let h = keepHue;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/* ---------- Pieces ---------- */

/** A touch / mouse area that reports where it is pressed or dragged, as 0-1 on both axes. */
function Surface({
  onChange,
  className,
  style,
  children,
}: {
  onChange: (x: number, y: number) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const report = (e: ReactPointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onChange(
      clamp((e.clientX - box.left) / box.width),
      clamp((e.clientY - box.top) / box.height)
    );
  };

  return (
    <div
      ref={ref}
      // touch-none: dragging here must not scroll the page
      className={`relative touch-none select-none ${className ?? ""}`}
      style={style}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        report(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) report(e);
      }}
    >
      {children}
    </div>
  );
}

function Thumb({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <span
      className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_2px_6px_rgba(0,0,0,0.5)]"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, backgroundColor: color }}
    />
  );
}

function ColorSheet({
  initial,
  onApply,
  onClose,
}: {
  initial: string;
  onApply: (hex: string) => void;
  onClose: () => void;
}) {
  const [hsv, setHsv] = useState<Hsv>(() =>
    hexToHsv(parseHex(initial) ?? "#CCCCCC")
  );
  const hex = hsvToHex(hsv);
  const [hexText, setHexText] = useState(hex);

  function set(next: Hsv) {
    setHsv(next);
    setHexText(hsvToHex(next));
  }

  useBackHandler(true, onClose);
  
  // Escape closes only this sheet, not the editor underneath it
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

  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Fermer le sélecteur de couleur"
        onClick={onClose}
        className="fade-in absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choisir une couleur"
        className="fade-in relative flex max-h-[92dvh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-t-2xl border border-white/10 bg-[#262626] p-4 pb-[max(env(safe-area-inset-bottom),1rem)] md:rounded-2xl"
      >
        {/* Preview and hex code */}
        <div className="flex items-center gap-3">
          <span
            className="h-12 w-12 shrink-0 rounded-full border border-white/30"
            style={{ backgroundColor: hex }}
            aria-hidden="true"
          />
          <input
            value={hexText}
            onChange={(e) => {
              setHexText(e.target.value);
              const parsed = parseHex(e.target.value);
              if (parsed) setHsv(hexToHsv(parsed, hsv.h));
            }}
            maxLength={7}
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
            aria-label="Code couleur hexadécimal"
            className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2.5 font-mono text-base uppercase text-neutral-100 focus:border-white/50 focus:outline-none"
          />
        </div>

        {/* Saturation (left to right) and brightness (bottom to top) */}
        <Surface
          className="h-44 w-full rounded-lg"
          style={{
            background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), ${pureHue}`,
          }}
          onChange={(x, y) => set({ ...hsv, s: x, v: 1 - y })}
        >
          <Thumb x={hsv.s} y={1 - hsv.v} color={hex} />
        </Surface>

        {/* Hue */}
        <Surface
          className="h-7 w-full rounded-full"
          style={{
            background:
              "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          }}
          onChange={(x) => set({ ...hsv, h: x * 360 })}
        >
          <Thumb x={hsv.h / 360} y={0.5} color={pureHue} />
        </Surface>

        {/* Presets */}
        <div className="grid grid-cols-7 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Couleur ${preset}`}
              onClick={() => set(hexToHsv(preset, hsv.h))}
              className={`aspect-square rounded-full border ${focusRing} ${
                preset === hex ? "border-white border-2" : "border-white/25"
              }`}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border border-white/25 py-3 text-base text-neutral-200 hover:bg-white/5 ${focusRing}`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onApply(hex)}
            className={`rounded-lg bg-white py-3 text-base font-medium text-neutral-900 hover:bg-neutral-200 ${focusRing}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/** A color swatch button that opens the picker. */
export default function ColorPicker({
  value,
  onChange,
  label = "Choisir une couleur",
}: {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={`h-11 w-14 shrink-0 rounded-lg border border-white/15 bg-[#171717] p-1.5 ${focusRing}`}
      >
        <span
          className="block h-full w-full rounded-md border border-white/20"
          style={{ backgroundColor: value }}
        />
      </button>

      {open && (
        <ColorSheet
          initial={value}
          onApply={(hex) => {
            onChange(hex);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
