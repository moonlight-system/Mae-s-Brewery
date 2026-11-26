"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  GLASS_PX,
  buildLayout,
  resolveVariant,
  type Cocktail,
  type GlassLayout,
  type Ingredient,
} from "../lib/recipes";
import {
  EMPTY_CUSTOM,
  isBundled,
  isBundledIngredient,
  loadCustom,
  mergeRecipes,
  restoreHiddenRecipes,
  saveCustom,
  type CustomData,
} from "../lib/customRecipes";
import IngredientManager from "./IngredientManager";
import RecipeEditor from "./RecipeEditor";
import RecipeTransfer from "./RecipeTransfer";
import UpdateBanner from "./UpdateBanner";
import { useBackHandler } from "../lib/backStack";
import BackButton from "./BackButton";
import { usedIngredientIds } from "../lib/customRecipes"; // add to the existing customRecipes import
import {
  buildTree, createFolder, deleteFolder, moveFolder, moveRecipe,
  moveToFolder, renameFolder, type Organisation,
} from "../lib/organize";
import FolderDialogs, { type FolderDialogState } from "./FolderDialogs";
import IngredientFilter from "./IngredientFilter";


const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

/* ---------- Sizes ---------- */

type Metrics = {
  tumblerW: number; // width of a cocktail glass
  shotInset: number; // how much each side of a shot glass narrows from rim to base
  shotBaseW: number; // width of the base of a shot glass
  glassH: number; // height of every glass
  corner: number; // radius of the bottom corners
  leader: number; // length of the line between the glass and a label
  labelGap: number; // space between that line and the label text
  reflect: number; // distance of the reflection stripe from the glass wall
};

// Wide screens (desktop, tablets in landscape)
const REGULAR: Metrics = {
  tumblerW: 208,
  shotInset: 16,
  shotBaseW: 264,
  glassH: GLASS_PX,
  corner: 5,
  leader: 32,
  labelGap: 12,
  reflect: 12,
};

// Phones: a narrower, shorter glass so the labels fit beside it
const COMPACT: Metrics = {
  tumblerW: 124,
  shotInset: 9,
  shotBaseW: 146,
  glassH: 360,
  corner: 4,
  leader: 18,
  labelGap: 8,
  reflect: 8,
};

// Below this width (of the main area) the compact layout is used
const COMPACT_BELOW = 768;

/**
 * The phone layout, scaled to the screen: the glass gets narrower on a narrow phone
 * (so the labels keep their room) and shorter on a short one (so the title, the variants
 * and the bottom buttons still fit).
 */
function compactMetrics(width: number, height: number | null): Metrics {
  const tumblerW = Math.min(150, Math.max(92, Math.round(width * 0.34)));
  const k = tumblerW / COMPACT.tumblerW;
  const glassH =
    height === null ? COMPACT.glassH : Math.min(360, Math.max(220, Math.round(height - 330)));
  return {
    ...COMPACT,
    tumblerW,
    shotInset: Math.round(COMPACT.shotInset * k),
    shotBaseW: Math.round(COMPACT.shotBaseW * k),
    leader: Math.round(COMPACT.leader * k),
    glassH,
  };
}

const POUR_MS = 1400; // time to fill a whole glass, poured at a constant rate
const MIN_POUR_MS = 160; // shortest time a single layer takes

const LONG_PRESS_MS = 500; // how long to hold a recipe to open its menu
const LONG_PRESS_MOVE_PX = 10; // moving more than this (scrolling) cancels the long press

/* ---------- Helpers ---------- */

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Size of an element, kept up to date when the window or the side panel changes size. */
function useClientSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setSize((prev) =>
        prev && prev.w === el.clientWidth && prev.h === el.clientHeight
          ? prev
          : { w: el.clientWidth, h: el.clientHeight }
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

/**
 * Outline of the glass: open at the top, straight sides for a tumbler,
 * slightly slanted ones (a shallow V) for a shot glass.
 * `fill` is the same shape closed along the rim, used to clip the liquid.
 */
function glassPaths(width: number, height: number, inset: number, r: number) {
  const W = width;
  const H = height;
  const len = Math.hypot(inset, H);
  const ux = inset / len;
  const uy = H / len;
  const f = (n: number) => n.toFixed(2);

  const rightCorner = [W - inset, H];
  const leftCorner = [inset, H];
  const rightUp = [rightCorner[0] + r * ux, H - r * uy]; // just above the corner, on the right side
  const rightIn = [rightCorner[0] - r, H]; // just inside the corner, on the base
  const leftIn = [leftCorner[0] + r, H];
  const leftUp = [leftCorner[0] - r * ux, H - r * uy];

  const outline =
    `M 0 0 L ${f(leftUp[0])} ${f(leftUp[1])} ` +
    `Q ${f(leftCorner[0])} ${H} ${f(leftIn[0])} ${H} ` +
    `L ${f(rightIn[0])} ${H} ` +
    `Q ${f(rightCorner[0])} ${H} ${f(rightUp[0])} ${f(rightUp[1])} ` +
    `L ${W} 0`;

  return { outline, fill: `${outline} Z` };
}

/* ---------- Small components ---------- */

function ArrowButton({
  direction,
  onClick,
  large,
}: {
  direction: "prev" | "next";
  onClick: () => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Variante précédente" : "Variante suivante"}
      className={`flex shrink-0 items-center justify-center rounded-full border border-white/25 text-neutral-300 transition-colors hover:border-white/50 hover:text-white ${focusRing} ${
        large ? "h-10 w-10 min-[400px]:h-11 min-[400px]:w-11" : "h-10 w-10"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={direction === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );
}

/** Name of the cocktail with its rating (number + one star), and its description under it. */
function CocktailTitle({
  name,
  rating,
  description,
  compact,
}: {
  name: string;
  rating?: number;
  description?: string;
  compact: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <h1
        className={`text-balance break-words font-semibold leading-tight tracking-tight ${
          compact ? "text-[clamp(1.25rem,6.2vw,1.75rem)]" : "text-3xl"
        }`}
      >
        {name}
        {rating !== undefined && (
          <span
            title={`Note : ${rating}`}
            className="ml-2 inline-block whitespace-nowrap text-[0.7em] font-medium text-amber-300"
          >
            {rating}&nbsp;★
          </span>
        )}
      </h1>
      {description && (
        <p
          className={`mt-1 break-words text-neutral-400 ${
            compact ? "text-sm leading-snug" : "text-base"
          }`}
        >
          {description}
        </p>
      )}
    </div>
  );
}

/** One recipe in the list. Tap to open it, hold (or right-click) for its menu. */
function RecipeItem({
  id,
  cocktail,
  active,
  onSelect,
  onLongPress,
}: {
  id: string;
  cocktail: Cocktail;
  active: boolean;
  onSelect: (id: string) => void;
  onLongPress: (id: string) => void;
}) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const firedAt = useRef(0);

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const fire = () => {
    // Android also sends a contextmenu event on long press: only open the menu once
    if (Date.now() - firedAt.current < 1000) return;
    firedAt.current = Date.now();
    navigator.vibrate?.(15);
    onLongPress(id);
  };

  const count = Object.keys(cocktail.variants ?? {}).length;

  return (
    <button
      type="button"
      aria-pressed={active}
      onPointerDown={(e) => {
        origin.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          fire();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const o = origin.current;
        if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > LONG_PRESS_MOVE_PX) {
          clear();
        }
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        clear();
        fire();
      }}
      onClick={() => {
        // The click that ends a long press must not also open the recipe
        if (Date.now() - firedAt.current < 800) return;
        onSelect(id);
      }}
      className={`w-full select-none rounded-md px-3 py-2.5 text-left transition-colors [-webkit-touch-callout:none] ${focusRing} ${
        active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5"
      }`}
    >
      <span className="block">{cocktail.name}</span>
      {count > 0 && (
        <span className="block text-xs text-neutral-500">
          {count} variante{count > 1 ? "s" : ""}
        </span>
      )}
    </button>
  );
}

type Section = { key: string; title: string; ids: string[]; folderId?: string };

function MiniButton({
  label, path, onClick, disabled, danger,
}: { label: string; path: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent ${
        danger ? "hover:text-red-400" : ""
      } ${focusRing}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );
}

const ICON = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  edit: "M4 20h4l10-10-4-4L4 16z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
};

/** Collapsible folders, then the cocktails and shots that are not in a folder. */
function RecipeList({
  sections, cocktails, activeId, organizing,
  onSelect, onLongPress, onMoveRecipe, onPickFolder,
  onMoveFolder, onRenameFolder, onDeleteFolder,
}: {
  sections: Section[];
  cocktails: Record<string, Cocktail>;
  activeId: string;
  organizing: boolean;
  onSelect: (id: string) => void;
  onLongPress: (id: string) => void;
  onMoveRecipe: (siblings: string[], id: string, delta: -1 | 1) => void;
  onPickFolder: (recipeId: string) => void;
  onMoveFolder: (folderId: string, delta: -1 | 1) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
}) {
  if (sections.length === 0) {
    return <p className="px-3 text-sm text-neutral-500">Aucune recette.</p>;
  }
  const folderIds = sections.flatMap((s) => (s.folderId ? [s.folderId] : []));

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => {
        const fi = section.folderId ? folderIds.indexOf(section.folderId) : -1;
        return (
          <details key={section.key} open className="group">
            <summary
              className={`flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200 ${focusRing} [&::-webkit-details-marker]:hidden`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
              {section.folderId && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={ICON.folder} />
                </svg>
              )}
              <span className="min-w-0 truncate">{section.title}</span>
              <span className="text-neutral-600">{section.ids.length}</span>
            </summary>

            {organizing && section.folderId && (
              <div className="mt-1 flex items-center gap-0.5 px-2">
                <MiniButton label="Monter le dossier" path={ICON.up} disabled={fi === 0}
                  onClick={() => onMoveFolder(section.folderId!, -1)} />
                <MiniButton label="Descendre le dossier" path={ICON.down} disabled={fi === folderIds.length - 1}
                  onClick={() => onMoveFolder(section.folderId!, 1)} />
                <MiniButton label="Renommer le dossier" path={ICON.edit}
                  onClick={() => onRenameFolder(section.folderId!)} />
                <MiniButton label="Supprimer le dossier" path={ICON.trash} danger
                  onClick={() => onDeleteFolder(section.folderId!)} />
              </div>
            )}

            <ul className={`mt-1 flex flex-col gap-1 ${section.folderId ? "ml-3 border-l border-white/10 pl-1" : ""}`}>
              {section.ids.length === 0 && (
                <li className="px-3 py-2 text-sm text-neutral-600">Dossier vide</li>
              )}
              {section.ids.map((id, i) => (
                <li key={id} className="flex items-center gap-0.5">
                  <div className="min-w-0 flex-1">
                    <RecipeItem id={id} cocktail={cocktails[id]} active={id === activeId}
                      onSelect={onSelect} onLongPress={onLongPress} />
                  </div>
                  {organizing && (
                    <>
                      <MiniButton label="Monter" path={ICON.up} disabled={i === 0}
                        onClick={() => onMoveRecipe(section.ids, id, -1)} />
                      <MiniButton label="Descendre" path={ICON.down} disabled={i === section.ids.length - 1}
                        onClick={() => onMoveRecipe(section.ids, id, 1)} />
                      <MiniButton label="Déplacer vers un dossier" path={ICON.folder}
                        onClick={() => onPickFolder(id)} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

/** Top of the recipe list: new folder, ingredient filter, organise mode. */
function ListToolbar({
  organizing, filterCount, onCreateFolder, onToggleOrganize, onFilter,
}: {
  organizing: boolean;
  filterCount: number;
  onCreateFolder: () => void;
  onToggleOrganize: () => void;
  onFilter: () => void;
}) {
  const btn = `flex items-center justify-center gap-2 rounded-lg border border-white/25 px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:bg-white/5 ${focusRing}`;
  return (
    <div className="mb-4 flex flex-col gap-2">
      <button type="button" onClick={onCreateFolder} className={`${btn} bg-white/5`}>
        ＋ Nouveau dossier
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onFilter}
          className={`${btn} ${filterCount > 0 ? "!border-white/60" : ""}`}>
          Ingrédients{filterCount > 0 ? ` (${filterCount})` : ""}
        </button>
        <button type="button" aria-pressed={organizing} onClick={onToggleOrganize}
          className={`${btn} ${organizing ? "!border-white !bg-white !text-neutral-900" : ""}`}>
          {organizing ? "Terminé" : "Organiser"}
        </button>
      </div>
    </div>
  );
}

/** Selected ingredients as removable chips, and how many recipes match. */
function ActiveFilterBar({
  names, count, onRemove, onClear,
}: { names: { id: string; name: string }[]; count: number; onRemove: (id: string) => void; onClear: () => void }) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {names.map(({ id, name }) => (
          <button key={id} type="button" onClick={() => onRemove(id)}
            aria-label={`Retirer ${name} du filtre`}
            className={`rounded-full border border-white/40 px-2.5 py-1 text-xs text-neutral-200 ${focusRing}`}>
            {name} ✕
          </button>
        ))}
        <button type="button" onClick={onClear}
          className={`px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 ${focusRing}`}>
          Effacer
        </button>
      </div>
      <p className="px-3 pt-2 text-xs text-neutral-500">
        {count} recette{count > 1 ? "s" : ""}
      </p>
    </div>
  );
}

/** Flask icon, used for the ingredients buttons. */
function FlaskIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5l-5.1-10.1a2 2 0 0 1-.2-.9V2" />
      <path d="M8.5 2h7M7 16h10" />
    </svg>
  );
}

/**
 * Bottom of the side panel: add a recipe, and bring back deleted built-in ones.
 * `onIngredients` adds an ingredients button (wide screens; on a phone it has its own button).
 */
function PanelFooter({
  onAdd,
  onRestore,
  canRestore,
  onIngredients,
  onExport,
  onImport,
}: {
  onAdd: () => void;
  onRestore: () => void;
  canRestore: boolean;
  onIngredients?: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-white/10 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <button
        type="button"
        onClick={onAdd}
        className={`flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-base font-medium text-neutral-900 transition-colors hover:bg-neutral-200 ${focusRing}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Ajouter une recette
      </button>
      {onIngredients && (
        <button
          type="button"
          onClick={onIngredients}
          className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/25 px-4 py-3 text-base text-neutral-200 transition-colors hover:bg-white/5 ${focusRing}`}
        >
          <FlaskIcon className="h-5 w-5" />
          Ingrédients
        </button>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onExport}
          className={`rounded-lg border border-white/25 px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:bg-white/5 ${focusRing}`}
        >
          Exporter
        </button>
        <button
          type="button"
          onClick={onImport}
          className={`rounded-lg border border-white/25 px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:bg-white/5 ${focusRing}`}
        >
          Importer
        </button>
      </div>
      {canRestore && (
        <button
          type="button"
          onClick={onRestore}
          className={`mt-2 w-full rounded-md py-2 text-sm text-neutral-400 hover:text-neutral-200 ${focusRing}`}
        >
          Restaurer les recettes supprimées
        </button>
      )}
    </div>
  );
}

/** Menu opened by a long press on a recipe: modify or delete (with a confirmation). */
function RecipeActionSheet({
  name,
  builtin,
  onEdit,
  onDelete,
  onClose,
  onMove
}: {
  name: string;
  builtin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onMove: () => void
}) {
  const [confirming, setConfirming] = useState(false);

  useBackHandler(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rowClass = `w-full rounded-lg px-4 py-3.5 text-left text-base transition-colors ${focusRing}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Fermer le menu"
        onClick={onClose}
        className="fade-in absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={name}
        className="fade-in relative w-full max-w-sm rounded-t-2xl border border-white/10 bg-[#262626] p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:rounded-2xl"
      >
        {confirming ? (
          <>
            <p className="px-3 pb-1 pt-2 text-base">Supprimer «&nbsp;{name}&nbsp;» ?</p>
            <p className="px-3 pb-3 text-sm text-neutral-400">
              {builtin
                ? "La recette sera masquée. Vous pourrez la restaurer depuis la liste."
                : "Cette action est définitive."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`${rowClass} border border-white/25 text-center text-neutral-200 hover:bg-white/5`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onDelete}
                className={`${rowClass} bg-red-500 text-center font-medium text-white hover:bg-red-400`}
              >
                Supprimer
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="truncate px-3 pb-2 pt-1 text-sm text-neutral-400">{name}</p>
            <button
              type="button"
              onClick={onEdit}
              className={`${rowClass} text-neutral-100 hover:bg-white/10`}
            >
              Modifier
            </button>
            <button type="button" onClick={onMove} className={`${rowClass} text-neutral-100 hover:bg-white/10`}>
              Déplacer vers un dossier
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`${rowClass} text-red-400 hover:bg-white/10`}
            >
              Supprimer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The row of variant labels. On a phone it is a single row that scrolls sideways. */
function VariantChips({
  items,
  activeId,
  onSelect,
  scroll,
}: {
  items: { id: string | undefined; label: string }[];
  activeId: string | undefined;
  onSelect: (id: string | undefined) => void;
  scroll: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep the selected label in view when it changes (swipe, arrows)
  useEffect(() => {
    if (!scroll) return;
    rowRef.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeId, scroll]);

  const buttons = items.map(({ id, label }) => {
    const active = id === activeId;
    return (
      <button
        key={id ?? "base"}
        type="button"
        aria-pressed={active}
        onClick={() => onSelect(id)}
        className={`shrink-0 whitespace-nowrap rounded-full border text-sm transition-colors ${focusRing} ${
          scroll ? "px-4 py-2" : "px-3 py-1"
        } ${
          active
            ? "border-white bg-white text-neutral-900"
            : "border-white/25 text-neutral-300 hover:border-white/50"
        }`}
      >
        {label}
      </button>
    );
  });

  if (!scroll) {
    return (
      <div
        ref={rowRef}
        role="group"
        aria-label="Variantes"
        className="flex flex-wrap justify-center gap-2"
      >
        {buttons}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* mx-auto centers the row when it fits and lets it scroll from the left when it doesn't */}
      <div
        ref={rowRef}
        role="group"
        aria-label="Variantes"
        className="mx-auto flex w-max gap-2 px-4 py-1"
      >
        {buttons}
      </div>
    </div>
  );
}

/* ---------- Labels ---------- */

const LABEL_GAP = 4; // minimum space between two labels, in px

type SizerRow = { key: string; text: string; quantity?: string; note: boolean };

type LabelItem = {
  key: string;
  note: boolean;
  center: number; // distance from the top of the glass of the point the label belongs to
  delay: number;
  text: string;
  quantity?: string;
};

function sameHeights(a: Record<string, number>, b: Record<string, number>) {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}

/**
 * Where to put each label vertically. `wanted` is where each label would like its center
 * to be (sorted from top to bottom) and `heights` how tall each one is. Labels that would
 * overlap are pushed apart as little as possible: a group of colliding labels is spread
 * around the middle of the spots its members wanted. Returns the top edge of each label.
 */
function placeLabels(
  wanted: number[],
  heights: number[],
  min: number,
  max: number
): number[] {
  type Cluster = { first: number; last: number; start: number; size: number };
  const desiredTop = wanted.map((c, i) => c - heights[i] / 2);

  // Best top for a stack of labels = average of where each would like to be
  const fit = (c: Cluster) => {
    let offset = 0;
    let sum = 0;
    for (let i = c.first; i <= c.last; i++) {
      sum += desiredTop[i] - offset;
      offset += heights[i] + LABEL_GAP;
    }
    c.start = sum / (c.last - c.first + 1);
    c.size = offset - LABEL_GAP;
  };

  const clusters: Cluster[] = [];
  for (let i = 0; i < wanted.length; i++) {
    const cluster: Cluster = { first: i, last: i, start: 0, size: 0 };
    fit(cluster);
    clusters.push(cluster);

    // Merge with the previous stack while they overlap
    while (clusters.length > 1) {
      const prev = clusters[clusters.length - 2];
      const last = clusters[clusters.length - 1];
      if (prev.start + prev.size + LABEL_GAP <= last.start) break;
      prev.last = last.last;
      clusters.pop();
      fit(prev);
    }
  }

  const tops: number[] = [];
  for (const c of clusters) {
    let top = c.start;
    for (let i = c.first; i <= c.last; i++) {
      tops[i] = top;
      top += heights[i] + LABEL_GAP;
    }
  }

  // Don't let a stack run too far past the top or the bottom of the glass
  let edge = min;
  for (let i = 0; i < tops.length; i++) {
    tops[i] = Math.max(tops[i], edge);
    edge = tops[i] + heights[i] + LABEL_GAP;
  }
  edge = max;
  for (let i = tops.length - 1; i >= 0; i--) {
    tops[i] = Math.min(tops[i], edge - heights[i]);
    edge = tops[i] - LABEL_GAP;
  }

  return tops;
}

/**
 * The column of labels next to the glass. Each label belongs to a point on the glass
 * (the middle of a layer, or the line between two layers for an action). When labels
 * would overlap (long or consecutive actions), they are moved apart and the leader line
 * bends to still reach its point.
 */
function GlassLabels({
  layout,
  timings,
  m,
  compact,
  inset,
  sizerRows,
}: {
  layout: GlassLayout;
  timings: { delay: number; duration: number }[];
  m: Metrics;
  compact: boolean;
  inset: number;
  sizerRows: SizerRow[];
}) {
  const glassH = m.glassH;
  const rootRef = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const [heights, setHeights] = useState<Record<string, number>>({});

  // A label's height depends on how many lines its text takes, so it has to be measured
  const measure = useCallback(() => {
    const next: Record<string, number> = {};
    elements.current.forEach((el, key) => {
      next[key] = el.offsetHeight;
    });
    setHeights((prev) => (sameHeights(prev, next) ? prev : next));
  }, []);

  // After every render, before the screen is painted: no visible jump
  useIsoLayoutEffect(measure);

  // Again when the column changes width (rotation, resize) or the fonts finish loading
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [measure]);

  const items: LabelItem[] = [
    ...layout.bars.map((bar, i) => ({
      key: bar.key,
      note: false,
      center: glassH - (bar.bottom + bar.height / 2),
      delay: timings[i].delay,
      text: bar.name,
      quantity: bar.quantity,
    })),
    ...layout.notes.map((note) => {
      // An action shows up once the layer right under it is full
      const below = layout.bars.findIndex(
        (b) => Math.abs(b.bottom + b.height - note.bottom) < 0.01
      );
      return {
        key: note.key,
        note: true,
        center: glassH - note.bottom,
        delay: below >= 0 ? timings[below].delay + timings[below].duration : 0,
        text: note.text,
      };
    }),
  ].sort((a, b) => a.center - b.center);

  const fallbackHeight = compact ? 18 : 24; // until the real height is measured
  const heightOf = (key: string) => heights[key] ?? fallbackHeight;
  const slack = compact ? 56 : 24; // how far labels may stick out above / below the glass
  const tops = placeLabels(
    items.map((item) => item.center),
    items.map((item) => heightOf(item.key)),
    -slack,
    glassH + slack
  );

  const textStart = m.leader + m.labelGap;

  return (
    <div ref={rootRef} className="relative min-w-0" style={{ height: glassH }}>
      {/* Invisible, zero-height copy of every label of the recipe and all its variants:
          it gives the column its natural width. A long action is capped so that it wraps
          instead of making the whole column (and the glass) wide. */}
      <div aria-hidden="true" className="invisible h-0 overflow-hidden">
        {sizerRows.map((r) =>
          r.note ? (
            <div
              key={r.key}
              className="text-sm italic"
              style={{ paddingLeft: textStart }}
            >
              <div style={{ maxWidth: compact ? "10rem" : "18rem" }}>{r.text}</div>
            </div>
          ) : (
            <div
              key={r.key}
              className={`whitespace-nowrap ${compact ? "text-sm" : ""}`}
              style={{ paddingLeft: textStart }}
            >
              {r.text}
              {r.quantity && <span className="ml-1.5">{r.quantity}</span>}
            </div>
          )
        )}
      </div>

      {/* Leader lines: straight when the label is in place, bent when it was moved */}
      <svg
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        width="1"
        height={glassH}
        aria-hidden="true"
      >
        {items.map((item, i) => {
          // How far the glass wall is from the column at that height (slanted for a shot)
          const wall = inset * (item.center / glassH);
          const labelY = tops[i] + heightOf(item.key) / 2;
          return (
            <path
              key={item.key}
              className="layer-label"
              style={{ animationDelay: `${item.delay}ms` }}
              d={`M ${-wall} ${item.center} H ${m.leader * 0.4} L ${m.leader} ${labelY}`}
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1"
              strokeDasharray={item.note ? "3 3" : undefined}
            />
          );
        })}
      </svg>

      {items.map((item, i) => (
        <div
          key={item.key}
          ref={(el) => {
            if (el) elements.current.set(item.key, el);
            else elements.current.delete(item.key);
          }}
          className={`layer-label absolute ${
            item.note
              ? "text-sm italic text-neutral-400"
              : compact
                ? "text-sm leading-[1.15]"
                : "whitespace-nowrap"
          }`}
          style={{
            left: textStart,
            right: 0,
            top: tops[i],
            animationDelay: `${item.delay}ms`,
          }}
        >
          {item.text}
          {item.quantity && (
            // nowrap: "2 cl" always stays together on one line
            <span className="ml-1.5 whitespace-nowrap text-neutral-400">
              {item.quantity}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Main component ---------- */

const NO_RECIPE: Cocktail = { name: "Maë’s Brewery", steps: [] };

export default function CocktailExplorer() {
  // recipes.json plus what the user added / edited / deleted (kept on the device)
  const [custom, setCustom] = useState<CustomData>(EMPTY_CUSTOM);
  const data = useMemo(() => mergeRecipes(custom), [custom]);

  const [selectedId, setSelectedId] = useState("");
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null); // long-press menu
  const [editor, setEditor] = useState<{ id: string | null } | null>(null); // null id = new recipe
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [transfer, setTransfer] = useState<"export" | "import" | null>(null);
  const [mainRef, mainSize] = useClientSize<HTMLElement>();
  const mainWidth = mainSize?.w ?? null;
  const mainHeight = mainSize?.h ?? null;
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [organizing, setOrganizing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterIds, setFilterIds] = useState<string[]>([]);
  const [matchAll, setMatchAll] = useState(true);

  useBackHandler(menuOpen, () => setMenuOpen(false));
  useBackHandler(organizing, () => setOrganizing(false));
  // localStorage only exists in the browser, so it is read after the first render
  useEffect(() => {
    setCustom(loadCustom());
  }, []);

  const cocktailIds = Object.keys(data.cocktails);

  // Every action already used in a recipe, offered as a suggestion in the editor
  const knownActions = useMemo(() => {
    const found = new Set<string>();
    for (const c of Object.values(data.cocktails)) {
      for (const s of c.steps ?? []) {
        if (s.type === "action") found.add(s.action);
      }
    }
    return [...found];
  }, [data]);

  // Falls back to the first recipe when nothing is selected or the selected one was deleted
  const cocktailId = data.cocktails[selectedId] ? selectedId : (cocktailIds[0] ?? "");

  const compact = mainWidth !== null && mainWidth < COMPACT_BELOW;
  const m = compact ? compactMetrics(mainWidth ?? COMPACT_BELOW, mainHeight) : REGULAR;

  const cocktail = data.cocktails[cocktailId] ?? NO_RECIPE;
  const variantEntries = Object.entries(cocktail.variants ?? {});
  const hasVariants = variantEntries.length > 0;
  const { name, steps } = resolveVariant(cocktail, variantId);

  const glassH = m.glassH;
  const layout = buildLayout(steps, data.ingredients, glassH);

  const isShot = cocktail.type === "shot";
  const inset = isShot ? m.shotInset : 0;
  const glassW = isShot ? m.shotBaseW + 2 * m.shotInset : m.tumblerW;
  const glass = glassPaths(glassW, glassH, inset, m.corner);

  // Pouring order: a layer only starts once the one under it is full, and the time a
  // layer takes is proportional to its height (constant flow).
  let pouredMs = 0;
  const timings = layout.bars.map((bar) => {
    const duration = Math.max(MIN_POUR_MS, (POUR_MS * bar.height) / glassH);
    const delay = pouredMs;
    pouredMs += duration;
    return { delay, duration };
  });

  const org = custom.organisation;

  // Ingredients of every recipe (base + variants), for the filter
  const recipeIngredients = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const [id, c] of Object.entries(data.cocktails)) map[id] = new Set(usedIngredientIds(c));
    return map;
  }, [data]);
  const availableIngredients = useMemo(
    () => [...new Set(Object.values(recipeIngredients).flatMap((s) => [...s]))],
    [recipeIngredients]
  );

  const activeFilter = filterIds.filter((id) => data.ingredients[id]);
  const filtering = activeFilter.length > 0;
  const shownIds = filtering
    ? cocktailIds.filter((id) => {
        const has = recipeIngredients[id];
        return matchAll ? activeFilter.every((i) => has.has(i)) : activeFilter.some((i) => has.has(i));
      })
    : cocktailIds;

  const tree = buildTree(shownIds, org, !filtering);
  const isShotId = (id: string) => data.cocktails[id].type === "shot";
  const sections = ([
    ...tree.folders.map((f) => ({ key: f.id, title: f.name, ids: f.ids, folderId: f.id })),
    { key: "cocktails", title: "Cocktails", ids: tree.loose.filter((id) => !isShotId(id)) },
    { key: "shots", title: "Shots", ids: tree.loose.filter(isShotId) },
  ] as Section[]).filter((s) => s.folderId || s.ids.length > 0);

  // undefined is the base recipe, followed by every variant
  const options: (string | undefined)[] = [
    undefined,
    ...variantEntries.map(([id]) => id),
  ];
  const chipItems = options.map((id) => ({
    id,
    label: id ? cocktail.variants![id].name : cocktail.name,
  }));

  // Every label of the base recipe and all its variants. They are rendered invisibly in
  // the label column so that it is exactly as wide as the longest one: no empty strip
  // on the right, and the display doesn't move while browsing variants.
  const sizerRows = options.flatMap((id) => {
    const l = buildLayout(
      resolveVariant(cocktail, id).steps,
      data.ingredients,
      glassH
    );
    return [
      ...l.bars.map((b) => ({
        key: `bar-${id ?? "base"}-${b.key}`,
        text: b.name,
        quantity: b.quantity,
        note: false,
      })),
      ...l.notes.map((n) => ({
        key: `note-${id ?? "base"}-${n.key}`,
        text: n.text,
        quantity: undefined,
        note: true,
      })),
    ];
  });

  function selectCocktail(id: string) {
    setSelectedId(id);
    setVariantId(undefined);
    setMenuOpen(false);
  }

  function go(delta: number) {
    if (!hasVariants) return;
    const index = options.indexOf(variantId);
    setVariantId(options[(index + delta + options.length) % options.length]);
  }

  /* ----- Adding, editing, deleting ----- */

  function update(next: CustomData) {
    setCustom(next);
    saveCustom(next);
  }

  function saveRecipe(
    id: string | null,
    recipe: Cocktail,
    newIngredients: Record<string, Ingredient>
  ) {
    const recipeId = id ?? `custom-${Date.now().toString(36)}`;
    update({
      ...custom,
      cocktails: { ...custom.cocktails, [recipeId]: recipe },
      ingredients: { ...custom.ingredients, ...newIngredients },
    });
    setEditor(null);
    selectCocktail(recipeId);
  }

  function deleteRecipe(id: string) {
    const cocktails = { ...custom.cocktails };
    delete cocktails[id];
    update({
      ...custom,
      cocktails,
      // A recipe from recipes.json can't be removed from the file, so it is hidden
      hidden:
        isBundled(id) && !custom.hidden.includes(id)
          ? [...custom.hidden, id]
          : custom.hidden,
    });
    setSheetId(null);
  }

  function restoreDeleted() {
    update(restoreHiddenRecipes(custom));
  }

  function updateOrg(next: Organisation) {
    update({ ...custom, organisation: next });
  }

  // id = null creates an ingredient. For a built-in ingredient the edited copy replaces it.
  function saveIngredient(id: string | null, ingredient: Ingredient) {
    const ingredientId = id ?? `custom-ing-${Date.now().toString(36)}`;
    update({
      ...custom,
      ingredients: { ...custom.ingredients, [ingredientId]: ingredient },
    });
  }

  function deleteIngredient(id: string) {
    const ingredients = { ...custom.ingredients };
    delete ingredients[id];
    update({
      ...custom,
      ingredients,
      // A built-in ingredient can't be removed from recipes.json, so it is hidden
      hiddenIngredients:
        isBundledIngredient(id) && !custom.hiddenIngredients.includes(id)
          ? [...custom.hiddenIngredients, id]
          : custom.hiddenIngredients,
    });
  }

  function restoreIngredients() {
    update({ ...custom, hiddenIngredients: [] });
  }

  function openEditor(id: string | null) {
    setSheetId(null);
    setEditor({ id });
  }

  // Swipe left / right on the glass to change variant
  const swipeProps = {
    onTouchStart: (e: ReactTouchEvent) => {
      const t = e.touches[0];
      swipeStart.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: ReactTouchEvent) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        go(dx < 0 ? 1 : -1);
      }
    },
  };

  // Escape closes the phone menu (unless something else is on top of it)
  useEffect(() => {
    if (!menuOpen || sheetId || editor || ingredientsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, sheetId, editor, ingredientsOpen]);

  const display =
    cocktailIds.length === 0 ? (
      <p className="px-8 text-center text-neutral-400">
        Aucune recette. Ajoutez-en une depuis le menu.
      </p>
    ) : layout.bars.length === 0 ? (
      <p className="px-8 text-center text-neutral-400">
        Cette recette n’a pas encore d’étapes.
      </p>
    ) : (
      <div
        // Remount on every selection so the glass fills again
        key={`${cocktailId}-${variantId ?? "base"}`}
        className={`flex items-start justify-center ${compact ? "w-full" : ""}`}
      >
        {/* Glass */}
        <div
          className="relative shrink-0"
          style={{ width: glassW, height: glassH }}
        >
          <div
            className="absolute inset-0 bg-white/5"
            style={{ clipPath: `path('${glass.fill}')` }}
          >
            {layout.bars.map((bar, i) => (
              <div
                key={bar.key}
                className="layer absolute inset-x-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                style={{
                  bottom: bar.bottom,
                  height: bar.height,
                  backgroundColor: bar.color,
                  animationDelay: `${timings[i].delay}ms`,
                  animationDuration: `${timings[i].duration}ms`,
                }}
              />
            ))}
            {/* Reflection on the glass */}
            <div
              className="pointer-events-none absolute bottom-10 top-2 w-1.5 rounded-full bg-white/20"
              style={{ left: inset + m.reflect }}
            />
          </div>

          {/* Glass wall, drawn over the liquid */}
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={glassW}
            height={glassH}
            aria-hidden="true"
          >
            <path
              d={glass.outline}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Labels */}
        <GlassLabels
          layout={layout}
          timings={timings}
          m={m}
          compact={compact}
          inset={inset}
          sizerRows={sizerRows}
        />
      </div>
    );

  const list = (
    <>
      <ListToolbar
        organizing={organizing}
        filterCount={activeFilter.length}
        onCreateFolder={() => setFolderDialog({ kind: "create" })}
        onToggleOrganize={() => setOrganizing((v) => !v)}
        onFilter={() => setFilterOpen(true)}
      />
      {filtering && (
        <ActiveFilterBar
          names={activeFilter.map((id) => ({ id, name: data.ingredients[id].name }))}
          count={shownIds.length}
          onRemove={(id) => setFilterIds((l) => l.filter((x) => x !== id))}
          onClear={() => setFilterIds([])}
        />
      )}
      <RecipeList
        sections={sections}
        cocktails={data.cocktails}
        activeId={cocktailId}
        organizing={organizing}
        onSelect={selectCocktail}
        onLongPress={setSheetId}
        onMoveRecipe={(siblings, id, delta) =>
          updateOrg(moveRecipe(org, cocktailIds, id, siblings, delta))
        }
        onPickFolder={(recipeId) => setFolderDialog({ kind: "move", recipeId })}
        onMoveFolder={(id, delta) => updateOrg(moveFolder(org, id, delta))}
        onRenameFolder={(id) => setFolderDialog({ kind: "rename", id })}
        onDeleteFolder={(id) => setFolderDialog({ kind: "delete", id })}
      />
    </>
  );

  const footer = (
    <PanelFooter
      onAdd={() => openEditor(null)}
      onRestore={restoreDeleted}
      canRestore={custom.hidden.length > 0}
      onExport={() => setTransfer("export")}
      onImport={() => setTransfer("import")}
    />
  );

  const desktopFooter = (
    <PanelFooter
      onAdd={() => openEditor(null)}
      onRestore={restoreDeleted}
      canRestore={custom.hidden.length > 0}
      onIngredients={() => setIngredientsOpen(true)}
      onExport={() => setTransfer("export")}
      onImport={() => setTransfer("import")}
    />
  );

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <BackButton/>
      {/* Phone top bar: just the title, the menu button lives at the bottom right */}
      <header className="flex shrink-0 items-center justify-center border-b border-white/10 bg-[#1f1f1f] px-3 pb-3 pt-[max(env(safe-area-inset-top),2.25rem)] md:hidden">
        <span className="font-medium">Maë’s Brewery</span>
      </header>

      {/* Shown only when GitHub has a newer release */}
      <UpdateBanner />

      {/* Side panel (wide screens) */}
      <nav
        aria-label="Recettes"
        className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#1f1f1f] md:flex"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{list}</div>
        {desktopFooter}
      </nav>

      {/* Phone buttons, within thumb reach: ingredients on the left, recipes on the right.
          They share one row and split its width, so they can never overlap. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-30 flex gap-3 pl-[max(env(safe-area-inset-left,0px),1rem)] pr-[max(env(safe-area-inset-right,0px),1rem)] md:hidden">
        <button
          type="button"
          onClick={() => setIngredientsOpen(true)}
          aria-label="Ouvrir la gestion des ingrédients"
          className={`pointer-events-auto flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-[#2a2a2a] px-3 text-neutral-100 shadow-lg shadow-black/50 active:bg-[#333] ${focusRing}`}
        >
          <FlaskIcon className="h-5 w-5 shrink-0" />
          <span className="truncate text-[clamp(0.875rem,4.2vw,1rem)]">Ingrédients</span>
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir la liste des recettes"
          aria-expanded={menuOpen}
          className={`pointer-events-auto flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-[#2a2a2a] px-3 text-neutral-100 shadow-lg shadow-black/50 active:bg-[#333] ${focusRing}`}
        >
          <span className="truncate text-[clamp(0.875rem,4.2vw,1rem)]">Recettes</span>
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Phone menu: slides in from the right */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Fermer la liste des recettes"
            onClick={() => setMenuOpen(false)}
            className="fade-in absolute inset-0 bg-black/60"
          />
          <nav
            aria-label="Recettes"
            className="drawer absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col border-l border-white/10 bg-[#1f1f1f] pt-[max(env(safe-area-inset-top),2.25rem)]"
          >
            <div className="mb-3 flex items-center justify-between px-4">
              <span className="px-3 font-medium">Recettes</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Fermer la liste des recettes"
                className={`flex h-11 w-11 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10 ${focusRing}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
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
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{list}</div>
            {footer}
          </nav>
        </div>
      )}

      {/* Long-press menu */}
      {sheetId && data.cocktails[sheetId] && (
        <RecipeActionSheet
          // Remount per recipe so the "are you sure?" step always starts closed
          key={sheetId}
          name={data.cocktails[sheetId].name}
          builtin={isBundled(sheetId)}
          onEdit={() => openEditor(sheetId)}
          onDelete={() => deleteRecipe(sheetId)}
          onClose={() => setSheetId(null)}
          onMove={() => {
            setFolderDialog({ kind: "move", recipeId: sheetId });
            setSheetId(null);
          }}
        />
      )}

      {/* Export / import */}
      {transfer && (
        <RecipeTransfer
          // Remount per mode so the dialog always starts at its first step
          key={transfer}
          mode={transfer}
          recipes={data}
          custom={custom}
          onApply={update}
          onClose={() => setTransfer(null)}
        />
      )}

      {/* Ingredients page */}
      {ingredientsOpen && (
        <IngredientManager
          ingredients={data.ingredients}
          cocktails={data.cocktails}
          canRestore={custom.hiddenIngredients.length > 0}
          onSave={saveIngredient}
          onDelete={deleteIngredient}
          onRestore={restoreIngredients}
          onClose={() => setIngredientsOpen(false)}
        />
      )}

      {/* Recipe editor */}
      {editor && (
        <RecipeEditor
          initial={editor.id ? data.cocktails[editor.id] : undefined}
          ingredients={data.ingredients}
          actions={knownActions}
          onSave={(recipe, newIngredients) =>
            saveRecipe(editor.id, recipe, newIngredients)
          }
          onCancel={() => setEditor(null)}
        />
      )}

      {filterOpen && (
        <IngredientFilter
          ingredients={data.ingredients}
          available={availableIngredients}
          selected={activeFilter}
          matchAll={matchAll}
          resultCount={shownIds.length}
          onToggle={(id) =>
            setFilterIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
          }
          onMatchAll={setMatchAll}
          onClear={() => setFilterIds([])}
          onClose={() => setFilterOpen(false)}
        />
      )}

      <FolderDialogs
        state={folderDialog}
        org={org}
        recipeName={
          folderDialog?.kind === "move" ? data.cocktails[folderDialog.recipeId]?.name : undefined
        }
        onClose={() => setFolderDialog(null)}
        onCreate={(name) => {
          updateOrg(createFolder(org, name));
          setFolderDialog(null);
        }}
        onRename={(id, name) => {
          updateOrg(renameFolder(org, id, name));
          setFolderDialog(null);
        }}
        onDelete={(id) => {
          updateOrg(deleteFolder(org, id));
          setFolderDialog(null);
        }}
        onMove={(recipeId, folderId) => {
          updateOrg(moveToFolder(org, recipeId, folderId));
          setFolderDialog(null);
        }}
      />

      {/* Main area */}
      <main
        ref={mainRef}
        className={`flex min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${
          compact
            ? // Extra room at the bottom so the menu button never covers the variant labels
              "flex-col px-4 pb-[calc(max(env(safe-area-inset-bottom),1rem)+6rem)] pt-4"
            : "px-6 py-10"
        }`}
      >
        {compact ? (
          <>
            {/* The glass takes the remaining height and sits in the middle of it */}
            <div
              className="flex min-h-0 w-full flex-1 touch-pan-y items-center justify-center py-3"
              {...swipeProps}
            >
              {display}
            </div>

            {/* Title with the variant arrows on both sides, between the glass and the variants */}
            <div className="flex shrink-0 items-center gap-2 pb-3">
              {hasVariants ? (
                <ArrowButton direction="prev" onClick={() => go(-1)} large />
              ) : (
                <span className="w-10 shrink-0 min-[400px]:w-11" />
              )}
              <CocktailTitle
                name={name}
                rating={cocktail.rating}
                description={cocktail.description}
                compact
              />
              {hasVariants ? (
                <ArrowButton direction="next" onClick={() => go(1)} large />
              ) : (
                <span className="w-10 shrink-0 min-[400px]:w-11" />
              )}
            </div>

            {hasVariants && (
              <div className="shrink-0">
                <VariantChips
                  key={cocktailId}
                  items={chipItems}
                  activeId={variantId}
                  onSelect={setVariantId}
                  scroll
                />
              </div>
            )}
          </>
        ) : (
          /*
            The carousel row is the only element in the flow, so its middle line is the
            middle of the screen. The glass and both arrows are centered on it; the title
            and the variant labels hang off it without affecting the centering.
          */
          <div className="relative m-auto flex items-center gap-4">
            <div className="absolute bottom-full left-1/2 mb-6 flex w-max max-w-xl -translate-x-1/2">
              <CocktailTitle
                name={name}
                rating={cocktail.rating}
                description={cocktail.description}
                compact={false}
              />
            </div>

            {hasVariants ? (
              <ArrowButton direction="prev" onClick={() => go(-1)} />
            ) : (
              <span className="w-10 shrink-0" />
            )}

            <div className="flex h-[480px] items-center" {...swipeProps}>
              {display}
            </div>

            {hasVariants ? (
              <ArrowButton direction="next" onClick={() => go(1)} />
            ) : (
              <span className="w-10 shrink-0" />
            )}

            {hasVariants && (
              <div className="absolute left-1/2 top-full mt-6 w-max max-w-xl -translate-x-1/2">
                <VariantChips
                  key={cocktailId}
                  items={chipItems}
                  activeId={variantId}
                  onSelect={setVariantId}
                  scroll={false}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}