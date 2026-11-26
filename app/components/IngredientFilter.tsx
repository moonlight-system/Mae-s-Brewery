"use client";

import { useState } from "react";
import type { Ingredient } from "../lib/recipes";
import Dialog from "./Dialog";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function IngredientFilter({
  ingredients,
  available,
  selected,
  matchAll,
  resultCount,
  onToggle,
  onMatchAll,
  onClear,
  onClose,
}: {
  ingredients: Record<string, Ingredient>;
  /** Ids of the ingredients used by at least one recipe */
  available: string[];
  selected: string[];
  matchAll: boolean;
  resultCount: number;
  onToggle: (id: string) => void;
  onMatchAll: (all: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const list = available
    .filter((id) => ingredients[id] && norm(ingredients[id].name).includes(norm(query)))
    .sort((a, b) => ingredients[a].name.localeCompare(ingredients[b].name, "fr"));

  const mode = (all: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={matchAll === all}
      onClick={() => onMatchAll(all)}
      className={`rounded-lg border py-2 text-sm transition-colors ${focusRing} ${
        matchAll === all ? "border-white bg-white text-neutral-900" : "border-white/25 text-neutral-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Dialog label="Filtrer par ingrédients" onClose={onClose}>
      <p className="px-3 pb-2 pt-2 text-base">Filtrer par ingrédients</p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {mode(true, "Tous")}
        {mode(false, "Au moins un")}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher un ingrédient…"
        aria-label="Chercher un ingrédient"
        className="mb-3 w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2.5 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-white/50 focus:outline-none"
      />

      <div className="mb-3 flex max-h-[40dvh] flex-wrap gap-2 overflow-y-auto overscroll-contain">
        {list.map((id) => {
          const on = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(id)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${focusRing} ${
                on ? "border-white bg-white text-neutral-900" : "border-white/25 text-neutral-300 hover:border-white/50"
              }`}
            >
              <span
                className="h-3 w-3 rounded-full border border-black/20"
                style={{ backgroundColor: ingredients[id].color }}
                aria-hidden="true"
              />
              {ingredients[id].name}
            </button>
          );
        })}
        {list.length === 0 && <p className="px-1 text-sm text-neutral-500">Aucun ingrédient.</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={selected.length === 0}
          className={`rounded-lg border border-white/25 px-4 py-3 text-base text-neutral-200 hover:bg-white/5 disabled:opacity-40 ${focusRing}`}
        >
          Effacer
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`rounded-lg bg-white px-4 py-3 text-base font-medium text-neutral-900 hover:bg-neutral-200 ${focusRing}`}
        >
          Voir {resultCount} recette{resultCount > 1 ? "s" : ""}
        </button>
      </div>
    </Dialog>
  );
}