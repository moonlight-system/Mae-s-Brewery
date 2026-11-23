"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Cocktail, Ingredient } from "../lib/recipes";
import { usedIngredientIds } from "../lib/customRecipes";
import ColorPicker from "./ColorPicker";
import Dialog from "./Dialog";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

const field =
  "w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2.5 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-white/50 focus:outline-none";

const NEW_COLOR = "#CCCCCC";

function IngredientRow({
  id,
  ingredient,
  usedBy,
  onSave,
  onDelete,
}: {
  id: string;
  ingredient: Ingredient;
  usedBy: string[];
  onSave: (id: string, ingredient: Ingredient) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(ingredient.name);

  // Follow the saved name if it changes from outside (React's "adjust state while rendering")
  const [savedName, setSavedName] = useState(ingredient.name);
  if (savedName !== ingredient.name) {
    setSavedName(ingredient.name);
    setName(ingredient.name);
  }

  // Saved when the field loses focus; an empty name is refused and put back
  function commitName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(ingredient.name);
      return;
    }
    if (trimmed !== ingredient.name) onSave(id, { ...ingredient, name: trimmed });
  }

  return (
    <li className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
      <ColorPicker
        value={ingredient.color}
        onChange={(color) => onSave(id, { ...ingredient, color })}
        label={`Couleur de ${ingredient.name}`}
      />
      <div className="min-w-0 flex-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label={`Nom de l’ingrédient ${ingredient.name}`}
          className="w-full rounded-md bg-transparent px-2 py-1 text-base text-neutral-100 focus:bg-[#171717] focus:outline-none focus:ring-1 focus:ring-white/40"
        />
        <p className="px-2 text-xs text-neutral-500">
          {usedBy.length === 0
            ? "Non utilisé"
            : `${usedBy.length} recette${usedBy.length > 1 ? "s" : ""}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDelete(id)}
        aria-label={`Supprimer ${ingredient.name}`}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-red-400 ${focusRing}`}
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
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      </button>
    </li>
  );
}

export default function IngredientManager({
  ingredients,
  cocktails,
  canRestore,
  onSave,
  onDelete,
  onRestore,
  onClose,
}: {
  ingredients: Record<string, Ingredient>;
  cocktails: Record<string, Cocktail>;
  /** True when deleted built-in ingredients can be brought back */
  canRestore: boolean;
  /** id = null creates a new ingredient */
  onSave: (id: string | null, ingredient: Ingredient) => void;
  onDelete: (id: string) => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(NEW_COLOR);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Names of the recipes that use each ingredient
  const usage = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const cocktail of Object.values(cocktails)) {
      for (const id of usedIngredientIds(cocktail)) {
        (map[id] ??= []).push(cocktail.name);
      }
    }
    return map;
  }, [cocktails]);

  const sorted = Object.entries(ingredients).sort((a, b) =>
    a[1].name.localeCompare(b[1].name, "fr")
  );

  function startAdding() {
    setAdding(true);
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function addIngredient() {
    const name = newName.trim();
    if (!name) return;
    onSave(null, { name, color: newColor });
    setAdding(false);
    setNewName("");
    setNewColor(NEW_COLOR);
  }

  const pending = pendingId ? ingredients[pendingId] : undefined;
  const pendingUsedBy = pendingId ? (usage[pendingId] ?? []) : [];

  const dialogButton = `w-full rounded-lg px-4 py-3 text-center text-base ${focusRing}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#171717] text-neutral-100">
      <header className="shrink-0 border-b border-white/10 bg-[#1f1f1f] px-4 pb-3 pt-[max(env(safe-area-inset-top),2.25rem)]">
        <h2 className="text-center font-medium">Ingrédients</h2>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-5">
          {adding && (
            <div className="flex flex-col gap-3 rounded-xl border border-white/30 bg-white/5 p-3">
              <span className="text-sm text-neutral-400">Nouvel ingrédient</span>
              <div className="flex items-center gap-2">
                <ColorPicker
                  value={newColor}
                  onChange={setNewColor}
                  label="Couleur du nouvel ingrédient"
                />
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addIngredient();
                  }}
                  placeholder="Nom"
                  aria-label="Nom du nouvel ingrédient"
                  className={field}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className={`${dialogButton} border border-white/25 text-neutral-200 hover:bg-white/5`}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={addIngredient}
                  disabled={!newName.trim()}
                  className={`${dialogButton} bg-white font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-40`}
                >
                  Ajouter
                </button>
              </div>
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {sorted.map(([id, ingredient]) => (
              <IngredientRow
                key={id}
                id={id}
                ingredient={ingredient}
                usedBy={usage[id] ?? []}
                onSave={onSave}
                onDelete={setPendingId}
              />
            ))}
          </ul>

          {sorted.length === 0 && (
            <p className="text-center text-neutral-500">Aucun ingrédient.</p>
          )}

          {canRestore && (
            <button
              type="button"
              onClick={onRestore}
              className={`rounded-md py-2 text-sm text-neutral-400 hover:text-neutral-200 ${focusRing}`}
            >
              Restaurer les ingrédients supprimés
            </button>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-[#1f1f1f] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`${dialogButton} border border-white/25 text-neutral-200 hover:bg-white/5`}
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={startAdding}
            className={`${dialogButton} bg-white font-medium text-neutral-900 hover:bg-neutral-200`}
          >
            ＋ Ajouter
          </button>
        </div>
      </footer>

      {/* Delete: refused while a recipe uses the ingredient, otherwise asks for confirmation */}
      {pendingId && pending && (
        <Dialog label={`Supprimer ${pending.name}`} onClose={() => setPendingId(null)}>
          {pendingUsedBy.length > 0 ? (
            <>
              <p className="px-3 pb-1 pt-2 text-base">
                «&nbsp;{pending.name}&nbsp;» est utilisé
              </p>
              <p className="px-3 pb-3 text-sm text-neutral-400">
                Retirez-le d’abord de ces recettes : {pendingUsedBy.join(", ")}.
              </p>
              <button
                type="button"
                onClick={() => setPendingId(null)}
                className={`${dialogButton} bg-white font-medium text-neutral-900 hover:bg-neutral-200`}
              >
                OK
              </button>
            </>
          ) : (
            <>
              <p className="px-3 pb-3 pt-2 text-base">
                Supprimer «&nbsp;{pending.name}&nbsp;» ?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPendingId(null)}
                  className={`${dialogButton} border border-white/25 text-neutral-200 hover:bg-white/5`}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(pendingId);
                    setPendingId(null);
                  }}
                  className={`${dialogButton} bg-red-500 font-medium text-white hover:bg-red-400`}
                >
                  Supprimer
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}