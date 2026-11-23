"use client";

import { useMemo, useRef, useState } from "react";
import type { Recipes } from "../lib/recipes";
import type { CustomData } from "../lib/customRecipes";
import {
  buildExport,
  parseImport,
  runImport,
  type ImportPlan,
  type ParsedImport,
} from "../lib/transfer";
import { canShare, copyText, saveJsonFile, shareJson } from "../lib/fileTransfer";
import Dialog from "./Dialog";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

const button = `w-full rounded-lg px-4 py-3 text-center text-base ${focusRing}`;
const primary = `${button} bg-white font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-40`;
const secondary = `${button} border border-white/25 text-neutral-200 hover:bg-white/5`;

const count = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`;

/* ---------- Export ---------- */

function ExportDialog({
  recipes,
  custom,
  onClose,
}: {
  recipes: Recipes;
  custom: CustomData;
  onClose: () => void;
}) {
  const allIds = Object.keys(recipes.cocktails);
  // "Mine" = recipes added or edited on this phone
  const mineIds = Object.keys(custom.cocktails).filter((id) =>
    Object.prototype.hasOwnProperty.call(recipes.cocktails, id)
  );
  const mine = new Set(mineIds);

  // Starts with my own recipes ticked (or everything when there are none): untick or tick to taste
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(mineIds.length > 0 ? mineIds : allIds)
  );
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const chosen = allIds.filter((id) => selected.has(id)); // keeps the order of the list
  const none = chosen.length === 0;
  const filename = `maes-brewery-recettes-${new Date().toISOString().slice(0, 10)}.json`;
  const text = JSON.stringify(buildExport(recipes, chosen), null, 2);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setStatus(null);
  }

  function pick(ids: string[]) {
    setSelected(new Set(ids));
    setStatus(null);
  }

  async function download() {
    const result = await saveJsonFile(filename, text);
    if (result.kind === "saved") setStatus({ text: "Fichier enregistré." });
    else if (result.kind === "downloaded") setStatus({ text: "Téléchargement lancé." });
    else if (result.kind === "failed") {
      setStatus({
        text: `Impossible d’enregistrer le fichier : ${result.message}. Utilisez « Copier le JSON » à la place.`,
        error: true,
      });
    } else setStatus(null);
  }

  async function copy() {
    setStatus(
      (await copyText(text))
        ? { text: "JSON copié dans le presse-papiers." }
        : { text: "Copie impossible.", error: true }
    );
  }

  async function share() {
    setStatus((await shareJson(filename, text)) ? null : { text: "Partage impossible.", error: true });
  }

  const chip = `rounded-full border border-white/25 px-3 py-1.5 text-sm text-neutral-300 hover:border-white/50 disabled:opacity-40 ${focusRing}`;

  return (
    <Dialog label="Exporter les recettes" onClose={onClose}>
      <p className="px-3 pb-2 pt-2 text-base">Quelles recettes exporter ?</p>

      <div className="flex flex-wrap gap-2 px-1 pb-3">
        <button type="button" onClick={() => pick(allIds)} className={chip}>
          Toutes
        </button>
        <button type="button" onClick={() => pick([])} className={chip}>
          Aucune
        </button>
        <button
          type="button"
          onClick={() => pick(mineIds)}
          disabled={mineIds.length === 0}
          className={chip}
        >
          Les miennes ({mineIds.length})
        </button>
      </div>

      <ul className="mb-2 max-h-[38dvh] overflow-y-auto overscroll-contain rounded-lg border border-white/10">
        {allIds.map((id) => {
          const recipe = recipes.cocktails[id];
          return (
            <li key={id} className="border-b border-white/5 last:border-b-0">
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={() => toggle(id)}
                  className="h-5 w-5 shrink-0 accent-white"
                />
                <span className="min-w-0 flex-1 truncate text-base">{recipe.name}</span>
                {mine.has(id) && <span className="text-xs text-neutral-500">perso</span>}
                {recipe.type === "shot" && (
                  <span className="text-xs text-neutral-500">shot</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="px-3 pb-3 text-sm text-neutral-400">
        {chosen.length} sur {allIds.length} sélectionnée{chosen.length > 1 ? "s" : ""}. Les
        ingrédients utilisés sont inclus.
      </p>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={download} disabled={none} className={primary}>
          Télécharger le fichier
        </button>
        <div className={`grid gap-2 ${canShare() ? "grid-cols-2" : "grid-cols-1"}`}>
          <button type="button" onClick={copy} disabled={none} className={secondary}>
            Copier le JSON
          </button>
          {canShare() && (
            <button type="button" onClick={share} disabled={none} className={secondary}>
              Partager
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className={secondary}>
          Fermer
        </button>
      </div>

      {status && (
        <p
          role={status.error ? "alert" : "status"}
          className={`px-3 pt-3 text-sm ${status.error ? "text-red-400" : "text-neutral-300"}`}
        >
          {status.text}
        </p>
      )}
    </Dialog>
  );
}

/* ---------- Import ---------- */

function ImportDialog({
  recipes,
  custom,
  onApply,
  onClose,
}: {
  recipes: Recipes;
  custom: CustomData;
  onApply: (next: CustomData) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [done, setDone] = useState<ImportPlan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function analyse(source: string) {
    const result = parseImport(source);
    if (result.ok) {
      setParsed(result.data);
      setError(null);
    } else {
      setParsed(null);
      setError(result.error);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const content = await file.text();
      setText(content);
      analyse(content);
    } catch {
      setError("Impossible de lire ce fichier.");
    }
  }

  // What importing would do (the answer is the same whatever the "replace" switch says)
  const plan = useMemo(
    () => (parsed ? runImport(custom, parsed, recipes, false).plan : null),
    [parsed, custom, recipes]
  );

  function apply() {
    if (!parsed) return;
    const result = runImport(custom, parsed, recipes, replace);
    onApply(result.next);
    setDone(result.plan);
  }

  /* Step 3: done */
  if (done) {
    const added = done.newRecipes.length + (replace ? 0 : done.changedRecipes.length);
    return (
      <Dialog label="Import terminé" onClose={onClose}>
        <p className="px-3 pb-1 pt-2 text-base">Import terminé</p>
        <p className="px-3 pb-3 text-sm text-neutral-400">
          {count(added, "recette ajoutée", "recettes ajoutées")}
          {replace && done.changedRecipes.length > 0 && (
            <>, {count(done.changedRecipes.length, "remplacée", "remplacées")}</>
          )}
          {done.newIngredients.length > 0 && (
            <>
              , {count(done.newIngredients.length, "ingrédient ajouté", "ingrédients ajoutés")}
            </>
          )}
          .
        </p>
        <button type="button" onClick={onClose} className={primary}>
          Fermer
        </button>
      </Dialog>
    );
  }

  /* Step 2: preview */
  if (parsed && plan) {
    const nothing =
      plan.newRecipes.length === 0 &&
      plan.changedRecipes.length === 0 &&
      plan.newIngredients.length === 0;

    return (
      <Dialog label="Importer les recettes" onClose={onClose}>
        <p className="px-3 pb-2 pt-2 text-base">Prêt à importer</p>

        <ul className="flex flex-col gap-1 px-3 pb-3 text-sm text-neutral-300">
          <li>{count(plan.newRecipes.length, "nouvelle recette", "nouvelles recettes")}</li>
          {plan.changedRecipes.length > 0 && (
            <li>
              {count(
                plan.changedRecipes.length,
                "recette déjà présente mais différente",
                "recettes déjà présentes mais différentes"
              )}
            </li>
          )}
          {plan.sameRecipes.length > 0 && (
            <li className="text-neutral-500">
              {count(plan.sameRecipes.length, "recette identique ignorée", "recettes identiques ignorées")}
            </li>
          )}
          {plan.newIngredients.length > 0 && (
            <li>
              {count(plan.newIngredients.length, "nouvel ingrédient", "nouveaux ingrédients")}
            </li>
          )}
          {plan.placeholders.length > 0 && (
            <li className="text-neutral-500">
              {count(
                plan.placeholders.length,
                "ingrédient absent du fichier, créé en gris",
                "ingrédients absents du fichier, créés en gris"
              )}
            </li>
          )}
          {parsed.skipped.length > 0 && (
            <li className="text-amber-400">
              {count(parsed.skipped.length, "élément invalide ignoré", "éléments invalides ignorés")}
              <span className="block text-xs text-neutral-500">
                {parsed.skipped.slice(0, 3).join(" · ")}
                {parsed.skipped.length > 3 ? " …" : ""}
              </span>
            </li>
          )}
        </ul>

        {plan.changedRecipes.length > 0 && (
          <label className="mx-3 mb-3 flex cursor-pointer items-start gap-3 rounded-lg border border-white/15 p-3">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-white"
            />
            <span className="text-sm text-neutral-300">
              Remplacer mes versions
              <span className="block text-xs text-neutral-500">
                Sinon, la version importée est ajoutée comme copie « (importée) ».
              </span>
            </span>
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setParsed(null)} className={secondary}>
            Retour
          </button>
          <button type="button" onClick={apply} disabled={nothing} className={primary}>
            Importer
          </button>
        </div>
        {nothing && (
          <p className="px-3 pt-3 text-sm text-neutral-500">Rien de nouveau à importer.</p>
        )}
      </Dialog>
    );
  }

  /* Step 1: pick a file or paste the JSON */
  return (
    <Dialog label="Importer des recettes" onClose={onClose}>
      <p className="px-3 pb-1 pt-2 text-base">Importer des recettes</p>
      <p className="px-3 pb-3 text-sm text-neutral-400">
        Choisissez un fichier exporté depuis l’app, ou un fichier recipes.json.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ""; // lets the same file be picked again
        }}
      />
      <button type="button" onClick={() => fileRef.current?.click()} className={primary}>
        Choisir un fichier…
      </button>

      <p className="px-3 pb-2 pt-4 text-sm text-neutral-400">… ou collez le JSON ici :</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="JSON à importer"
        className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2.5 font-mono text-xs text-neutral-100 focus:border-white/50 focus:outline-none"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className={secondary}>
          Annuler
        </button>
        <button
          type="button"
          onClick={() => analyse(text)}
          disabled={!text.trim()}
          className={primary}
        >
          Analyser
        </button>
      </div>

      {error && (
        <p role="alert" className="px-3 pt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </Dialog>
  );
}

export default function RecipeTransfer({
  mode,
  recipes,
  custom,
  onApply,
  onClose,
}: {
  mode: "export" | "import";
  recipes: Recipes;
  custom: CustomData;
  onApply: (next: CustomData) => void;
  onClose: () => void;
}) {
  return mode === "export" ? (
    <ExportDialog recipes={recipes} custom={custom} onClose={onClose} />
  ) : (
    <ImportDialog recipes={recipes} custom={custom} onApply={onApply} onClose={onClose} />
  );
}