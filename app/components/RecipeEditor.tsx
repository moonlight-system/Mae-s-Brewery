"use client";

import { useEffect, useState } from "react";
import {
  MAX_DESCRIPTION,
  MAX_RATING,
  type Cocktail,
  type Ingredient,
  type Step,
  type Variant,
} from "../lib/recipes";
import ColorPicker from "./ColorPicker";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

const field =
  "w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2.5 text-base text-neutral-100 [color-scheme:dark] placeholder:text-neutral-600 focus:border-white/50 focus:outline-none";

const smallLabel = "text-xs font-medium uppercase tracking-wide text-neutral-400";

const NEW = "__new__"; // value of an ingredient <select> for "create a new ingredient"
const STEP_REF = "step:"; // "replace" value for an ingredient that is created in this same form
const UNITS = ["cl", "ml", "g", ""]; // "" = no unit
const MODES = [
  ["quantity", "Quantité"],
  ["top", "Compléter"],
  ["thin", "Fine couche"],
] as const;
const ACTION_SUGGESTIONS = [
  "Écraser",
  "Secouer",
  "Mélanger",
  "Filtrer",
  "Enflammer",
  "Brûler",
];

/* ---------- Form state ---------- */

/** An ingredient choice: an existing one, or a new one to create (name + color). */
type IngredientRef = {
  ingredient: string; // ingredient id, NEW, or "" when nothing is chosen yet
  newName: string;
  newColor: string;
};

/** One step of the form. Kept as strings so the inputs can be edited freely. */
type Draft = IngredientRef & {
  uid: string;
  kind: "ingredient" | "action";
  /** "quantity" = an amount, "top" = fills a quarter of the glass, "thin" = a thin layer */
  mode: "quantity" | "top" | "thin";
  quantity: string;
  unit: string;
  action: string;
};

/** "Replace `from` with `ingredient`" in a variant. */
type Replacement = IngredientRef & {
  uid: string;
  from: string; // ingredient id of the recipe, or STEP_REF + uid of a step with a new ingredient
};

type VariantDraft = {
  uid: string;
  id?: string; // kept when editing an existing variant
  name: string;
  replacements: Replacement[];
  added: Draft[]; // steps added at the end of the recipe
  stepsOverride?: Step[]; // a variant that redefines all the steps: kept, not editable here
};

let uidCounter = 0;
const nextUid = () => `item-${++uidCounter}`;

const blankRef = (): IngredientRef => ({
  ingredient: "",
  newName: "",
  newColor: "#cccccc",
});

function blank(kind: Draft["kind"]): Draft {
  return {
    uid: nextUid(),
    kind,
    ...blankRef(),
    mode: "quantity",
    quantity: "",
    unit: "cl",
    action: "",
  };
}

function toDrafts(steps: Step[]): Draft[] {
  return steps.map((s) =>
    s.type === "action"
      ? { ...blank("action"), action: s.action }
      : {
          ...blank("ingredient"),
          ingredient: s.ingredient,
          mode: s.mode ?? "quantity",
          quantity: s.quantity !== undefined ? String(s.quantity) : "",
          unit: s.unit ?? (s.quantity !== undefined ? "" : "cl"),
        }
  );
}

function toVariantDrafts(variants: Record<string, Variant>): VariantDraft[] {
  return Object.entries(variants).map(([id, v]) => ({
    uid: nextUid(),
    id,
    name: v.name,
    replacements: Object.entries(v.replace ?? {}).map(([from, to]) => ({
      uid: nextUid(),
      from,
      ...blankRef(),
      ingredient: to,
    })),
    added: toDrafts(v.add ?? []),
    stepsOverride: v.steps,
  }));
}

/* ---------- Turning the form into a recipe ---------- */

class FormError extends Error {}

type BuildContext = {
  stamp: string;
  created: number;
  newIngredients: Record<string, Ingredient>;
  stepIds: Map<string, string>; // step uid -> the ingredient id that step ended up with
};

/** The id of the chosen ingredient. A new ingredient gets its id (and is registered) here. */
function resolveIngredient(ref: IngredientRef, ctx: BuildContext, label: string): string {
  if (!ref.ingredient) throw new FormError(`${label} : choisissez un ingrédient.`);
  if (ref.ingredient !== NEW) return ref.ingredient;

  const name = ref.newName.trim();
  if (!name) throw new FormError(`${label} : donnez un nom au nouvel ingrédient.`);
  const id = `custom-${ctx.stamp}-${ctx.created++}`;
  ctx.newIngredients[id] = { name, color: ref.newColor };
  return id;
}

function buildSteps(
  drafts: Draft[],
  ctx: BuildContext,
  labelOf: (index: number) => string
): Step[] {
  const steps: Step[] = [];

  drafts.forEach((d, i) => {
    const label = labelOf(i);

    if (d.kind === "action") {
      const action = d.action.trim();
      if (action) steps.push({ type: "action", action });
      return;
    }

    const ingredientId = resolveIngredient(d, ctx, label);
    ctx.stepIds.set(d.uid, ingredientId);

    const step: Extract<Step, { type: "ingredient" }> = {
      type: "ingredient",
      ingredient: ingredientId,
    };
    const rawQuantity = d.mode === "quantity" ? d.quantity.trim().replace(",", ".") : "";
    if (d.mode !== "quantity") step.mode = d.mode;
    if (rawQuantity) {
      const quantity = Number(rawQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new FormError(`${label} : quantité invalide.`);
      }
      step.quantity = quantity;
      if (d.unit) step.unit = d.unit;
    }
    steps.push(step);
  });

  return steps;
}

/* ---------- Small pieces ---------- */

function Icon({ path }: { path: string }) {
  return (
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
      <path d={path} />
    </svg>
  );
}

function IconButton({
  label,
  path,
  onClick,
  disabled,
}: {
  label: string;
  path: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent ${focusRing}`}
    >
      <Icon path={path} />
    </button>
  );
}

/** Dropdown of existing ingredients, with "new ingredient" (name + color) at the end. */
function IngredientSelect({
  value,
  onChange,
  ingredients,
  sorted,
  label,
}: {
  value: IngredientRef;
  onChange: (changes: Partial<IngredientRef>) => void;
  ingredients: Record<string, Ingredient>;
  sorted: [string, Ingredient][];
  label: string;
}) {
  const swatch =
    value.ingredient === NEW ? value.newColor : ingredients[value.ingredient]?.color;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className="h-6 w-6 shrink-0 rounded-full border border-white/30"
          style={{ backgroundColor: swatch ?? "transparent" }}
          aria-hidden="true"
        />
        <select
          value={value.ingredient}
          onChange={(e) => onChange({ ingredient: e.target.value })}
          aria-label={label}
          className={field}
        >
          <option value="" disabled>
            Choisir un ingrédient…
          </option>
          {sorted.map(([id, ing]) => (
            <option key={id} value={id}>
              {ing.name}
            </option>
          ))}
          <option value={NEW}>＋ Nouvel ingrédient…</option>
        </select>
      </div>

      {value.ingredient === NEW && (
        <div className="flex items-center gap-2">
          <input
            value={value.newName}
            onChange={(e) => onChange({ newName: e.target.value })}
            placeholder="Nom du nouvel ingrédient"
            aria-label="Nom du nouvel ingrédient"
            className={field}
          />
          <ColorPicker
            value={value.newColor}
            onChange={(color) => onChange({ newColor: color })}
            label="Couleur du nouvel ingrédient"
          />
        </div>
      )}
    </div>
  );
}

/** The list of steps (ingredients and actions) with reordering. Used for the recipe and for variants. */
function StepsEditor({
  drafts,
  onChange,
  ingredients,
  sorted,
  knownActions,
  nested,
}: {
  drafts: Draft[];
  onChange: (drafts: Draft[]) => void;
  ingredients: Record<string, Ingredient>;
  sorted: [string, Ingredient][];
  knownActions: string[];
  nested?: boolean;
}) {
  const patch = (uid: string, changes: Partial<Draft>) =>
    onChange(drafts.map((d) => (d.uid === uid ? { ...d, ...changes } : d)));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (uid: string) => onChange(drafts.filter((d) => d.uid !== uid));
  const add = (kind: Draft["kind"]) => onChange([...drafts, blank(kind)]);

  return (
    <div className="flex flex-col gap-2">
      {drafts.length > 0 && (
        <ol className="flex flex-col gap-3">
          {drafts.map((d, i) => (
            <li
              key={d.uid}
              className={`rounded-xl border border-white/10 p-3 ${
                nested ? "bg-black/20" : "bg-white/5"
              }`}
            >
              <div className="mb-2 flex items-center gap-1">
                <span className="w-6 text-center text-xs text-neutral-500">{i + 1}</span>
                <span className={`flex-1 ${smallLabel}`}>
                  {d.kind === "ingredient" ? "Ingrédient" : "Action"}
                </span>
                <IconButton
                  label="Monter l’étape"
                  path="M6 15l6-6 6 6"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                />
                <IconButton
                  label="Descendre l’étape"
                  path="M6 9l6 6 6-6"
                  onClick={() => move(i, 1)}
                  disabled={i === drafts.length - 1}
                />
                <IconButton
                  label="Supprimer l’étape"
                  path="M6 6l12 12M18 6L6 18"
                  onClick={() => remove(d.uid)}
                />
              </div>

              {d.kind === "action" ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={d.action}
                    onChange={(e) => patch(d.uid, { action: e.target.value })}
                    placeholder="Ex. Secouer"
                    aria-label="Action"
                    className={field}
                  />
                  {/* Own suggestion chips: the native <datalist> popup gets stuck on Android */}
                  {(() => {
                    const typed = d.action.trim().toLowerCase();
                    const shown = knownActions.filter(
                      (a) =>
                        a.toLowerCase() !== typed && a.toLowerCase().includes(typed)
                    );
                    return shown.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {shown.map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => patch(d.uid, { action: a })}
                            className={`rounded-full border border-white/25 px-3 py-1.5 text-sm text-neutral-300 hover:border-white/50 ${focusRing}`}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <IngredientSelect
                    value={d}
                    onChange={(changes) => patch(d.uid, changes)}
                    ingredients={ingredients}
                    sorted={sorted}
                    label="Ingrédient"
                  />
                  <div role="group" aria-label="Mode de dosage" className="grid grid-cols-3 gap-1.5">
                    {MODES.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={d.mode === value}
                        onClick={() => patch(d.uid, { mode: value })}
                        className={`rounded-lg border px-1 py-2 text-sm transition-colors ${focusRing} ${
                          d.mode === value
                            ? "border-white bg-white text-neutral-900"
                            : "border-white/25 text-neutral-300"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {d.mode === "quantity" ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={d.quantity}
                      onChange={(e) => patch(d.uid, { quantity: e.target.value })}
                      inputMode="decimal"
                      placeholder="Quantité (optionnel)"
                      aria-label="Quantité"
                      className={field}
                    />
                    <select
                      value={d.unit}
                      onChange={(e) => patch(d.uid, { unit: e.target.value })}
                      aria-label="Unité"
                      className={`${field} !w-28 shrink-0`}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u || "(aucune)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  ) : (
                    <p className="text-xs text-neutral-500">
                      {d.mode === "top"
                        ? "Complète le verre : prend un quart du volume, le reste est réduit en proportion."
                        : "Une fine couche (sucre, zeste…), sans quantité."}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => add("ingredient")}
          className={`rounded-lg border border-dashed border-white/30 py-3 text-base text-neutral-200 hover:bg-white/5 ${focusRing}`}
        >
          ＋ Ingrédient
        </button>
        <button
          type="button"
          onClick={() => add("action")}
          className={`rounded-lg border border-dashed border-white/30 py-3 text-base text-neutral-200 hover:bg-white/5 ${focusRing}`}
        >
          ＋ Action
        </button>
      </div>
    </div>
  );
}

/** One variant: a name, ingredient replacements, and steps added at the end. */
function VariantCard({
  index,
  draft,
  onChange,
  onRemove,
  fromOptions,
  ingredients,
  sorted,
  knownActions,
}: {
  index: number;
  draft: VariantDraft;
  onChange: (changes: Partial<VariantDraft>) => void;
  onRemove: () => void;
  fromOptions: { value: string; label: string }[];
  ingredients: Record<string, Ingredient>;
  sorted: [string, Ingredient][];
  knownActions: string[];
}) {
  const patchReplacement = (uid: string, changes: Partial<Replacement>) =>
    onChange({
      replacements: draft.replacements.map((r) =>
        r.uid === uid ? { ...r, ...changes } : r
      ),
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-3">
      <div className="flex items-center gap-1">
        <span className={`flex-1 pl-1 ${smallLabel}`}>Variante {index + 1}</span>
        <IconButton
          label={`Supprimer la variante ${index + 1}`}
          path="M6 6l12 12M18 6L6 18"
          onClick={onRemove}
        />
      </div>

      <input
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Nom de la variante (ex. Moscow Mule)"
        aria-label="Nom de la variante"
        className={field}
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm text-neutral-400">Ingrédients remplacés</span>

        {draft.replacements.map((r) => {
          const stale = r.from !== "" && !fromOptions.some((o) => o.value === r.from);
          return (
            <div
              key={r.uid}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className={`w-14 shrink-0 ${smallLabel}`}>Retirer</span>
                <select
                  value={r.from}
                  onChange={(e) => patchReplacement(r.uid, { from: e.target.value })}
                  aria-label="Ingrédient à remplacer"
                  className={field}
                >
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {fromOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  {stale && (
                    <option value={r.from}>
                      {ingredients[r.from]?.name ?? r.from} (n’est plus dans la recette)
                    </option>
                  )}
                </select>
                <IconButton
                  label="Supprimer le remplacement"
                  path="M6 6l12 12M18 6L6 18"
                  onClick={() =>
                    onChange({
                      replacements: draft.replacements.filter((x) => x.uid !== r.uid),
                    })
                  }
                />
              </div>
              <div className="flex items-start gap-2">
                <span className={`mt-3 w-14 shrink-0 ${smallLabel}`}>Mettre</span>
                <div className="min-w-0 flex-1">
                  <IngredientSelect
                    value={r}
                    onChange={(changes) => patchReplacement(r.uid, changes)}
                    ingredients={ingredients}
                    sorted={sorted}
                    label="Ingrédient de remplacement"
                  />
                </div>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            onChange({
              replacements: [
                ...draft.replacements,
                { uid: nextUid(), from: "", ...blankRef() },
              ],
            })
          }
          disabled={fromOptions.length === 0}
          className={`rounded-lg border border-dashed border-white/30 py-3 text-base text-neutral-200 hover:bg-white/5 disabled:opacity-40 ${focusRing}`}
        >
          ＋ Remplacement
        </button>
        {fromOptions.length === 0 && (
          <p className="text-xs text-neutral-500">
            Ajoutez d’abord des ingrédients à la recette.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <span className="text-sm text-neutral-400">Étapes ajoutées à la fin</span>
          <p className="text-xs text-neutral-600">Versées par-dessus la recette de base.</p>
        </div>
        <StepsEditor
          drafts={draft.added}
          onChange={(added) => onChange({ added })}
          ingredients={ingredients}
          sorted={sorted}
          knownActions={knownActions}
          nested
        />
      </div>

      {draft.stepsOverride && (
        <p className="text-xs text-neutral-500">
          Cette variante redéfinit aussi toutes les étapes de la recette (non modifiable ici).
        </p>
      )}
    </div>
  );
}

/* ---------- The editor ---------- */

export default function RecipeEditor({
  initial,
  ingredients,
  actions = [],
  onSave,
  onCancel,
}: {
  initial?: Cocktail;
  ingredients: Record<string, Ingredient>;
  /** Actions already used in existing recipes, offered as suggestions */
  actions?: string[];
  onSave: (
    cocktail: Cocktail,
    newIngredients: Record<string, Ingredient>
  ) => void;
  onCancel: () => void;
}) {
  // Defaults + actions from existing recipes, without duplicates (case-insensitive)
  const knownActions = [
    ...new Map(
      [...ACTION_SUGGESTIONS, ...actions].map((a) => [a.toLowerCase(), a])
    ).values(),
  ];

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [rating, setRating] = useState(
    initial?.rating !== undefined ? String(initial.rating) : ""
  );
  const [type, setType] = useState<"cocktail" | "shot">(
    initial?.type === "shot" ? "shot" : "cocktail"
  );
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initial?.steps?.length ? toDrafts(initial.steps) : [blank("ingredient")]
  );
  const [variants, setVariants] = useState<VariantDraft[]>(() =>
    initial?.variants ? toVariantDrafts(initial.variants) : []
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const sorted = Object.entries(ingredients).sort((a, b) =>
    a[1].name.localeCompare(b[1].name, "fr")
  );

  // The ingredients of the recipe, which a variant can replace
  const fromOptions: { value: string; label: string }[] = [];
  {
    const seen = new Set<string>();
    for (const d of drafts) {
      if (d.kind !== "ingredient" || !d.ingredient) continue;
      if (d.ingredient === NEW) {
        fromOptions.push({
          value: STEP_REF + d.uid,
          label: d.newName.trim() || "Nouvel ingrédient",
        });
      } else if (!seen.has(d.ingredient)) {
        seen.add(d.ingredient);
        fromOptions.push({
          value: d.ingredient,
          label: ingredients[d.ingredient]?.name ?? d.ingredient,
        });
      }
    }
  }

  function patchVariant(uid: string, changes: Partial<VariantDraft>) {
    setVariants((list) => list.map((v) => (v.uid === uid ? { ...v, ...changes } : v)));
  }

  function save() {
    try {
      const trimmedName = name.trim();
      if (!trimmedName) throw new FormError("Donnez un nom à la recette.");

      let ratingValue: number | undefined;
      const rawRating = rating.trim().replace(",", ".");
      if (rawRating) {
        const n = Number(rawRating);
        if (!Number.isFinite(n) || n < 0 || n > MAX_RATING) {
          throw new FormError(`La note doit être un nombre entre 0 et ${MAX_RATING}.`);
        }
        ratingValue = n;
      }

      const ctx: BuildContext = {
        stamp: Date.now().toString(36),
        created: 0,
        newIngredients: {},
        stepIds: new Map(),
      };

      const steps = buildSteps(drafts, ctx, (i) => `Étape ${i + 1}`);
      if (!steps.some((s) => s.type === "ingredient")) {
        throw new FormError("Ajoutez au moins un ingrédient.");
      }
      const baseIds = new Set(
        steps.flatMap((s) => (s.type === "ingredient" ? [s.ingredient] : []))
      );

      const variantsOut: Record<string, Variant> = {};
      variants.forEach((v, k) => {
        const where = `Variante ${k + 1}`;
        const variantName = v.name.trim();
        if (!variantName) throw new FormError(`${where} : donnez-lui un nom.`);
        const named = `${where} (« ${variantName} »)`;

        const replace: Record<string, string> = {};
        v.replacements.forEach((r, j) => {
          const label = `${named}, remplacement ${j + 1}`;
          if (!r.from) throw new FormError(`${label} : choisissez l’ingrédient à retirer.`);

          let fromId = r.from;
          if (fromId.startsWith(STEP_REF)) {
            const id = ctx.stepIds.get(fromId.slice(STEP_REF.length));
            if (!id) throw new FormError(`${label} : l’ingrédient à retirer n’existe plus.`);
            fromId = id;
          } else if (!baseIds.has(fromId)) {
            throw new FormError(
              `${label} : « ${ingredients[fromId]?.name ?? fromId} » n’est plus dans la recette.`
            );
          }
          replace[fromId] = resolveIngredient(r, ctx, label);
        });

        const add = buildSteps(v.added, ctx, (i) => `${named}, étape ${i + 1}`);

        const variant: Variant = { name: variantName };
        if (Object.keys(replace).length > 0) variant.replace = replace;
        if (add.length > 0) variant.add = add;
        if (v.stepsOverride) variant.steps = v.stepsOverride;
        if (!variant.replace && !variant.add && !variant.steps) {
          throw new FormError(`${named} : ajoutez un remplacement ou une étape.`);
        }

        variantsOut[v.id ?? `variant-${ctx.stamp}-${k}`] = variant;
      });

      setError(null);
      onSave(
        {
          ...initial, // keeps anything this form doesn't edit
          name: trimmedName,
          description: description.trim() || undefined,
          rating: ratingValue,
          type,
          steps,
          variants: Object.keys(variantsOut).length > 0 ? variantsOut : undefined,
        },
        ctx.newIngredients
      );
    } catch (e) {
      if (e instanceof FormError) setError(e.message);
      else throw e;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#171717] text-neutral-100">
      <header className="shrink-0 border-b border-white/10 bg-[#1f1f1f] px-4 pb-3 pt-[max(env(safe-area-inset-top),2.25rem)]">
        <h2 className="text-center font-medium">
          {initial ? "Modifier la recette" : "Nouvelle recette"}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-neutral-400">Nom</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Mojito"
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-neutral-400">
              Description <span className="text-neutral-600">(optionnel)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESCRIPTION}
              rows={2}
              placeholder="Description"
              className={`${field} resize-none`}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-neutral-400">
              Note sur {MAX_RATING} <span className="text-neutral-600">(optionnel)</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                inputMode="decimal"
                placeholder="Ex. 4.5"
                className={`${field} !w-28`}
              />
              <span className="text-xl text-amber-300" aria-hidden="true">
                ★
              </span>
            </div>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-neutral-400">Type</span>
            <div className="grid grid-cols-2 gap-2">
              {(["cocktail", "shot"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  className={`rounded-lg border py-2.5 text-base transition-colors ${focusRing} ${
                    type === t
                      ? "border-white bg-white text-neutral-900"
                      : "border-white/25 text-neutral-300"
                  }`}
                >
                  {t === "cocktail" ? "Cocktail" : "Shot"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div>
              <span className="text-sm text-neutral-400">Étapes</span>
              <p className="text-xs text-neutral-600">
                Elles sont versées dans l’ordre, de bas en haut du verre.
              </p>
            </div>
            <StepsEditor
              drafts={drafts}
              onChange={setDrafts}
              ingredients={ingredients}
              sorted={sorted}
              knownActions={knownActions}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <span className="text-sm text-neutral-400">Variantes</span>
              <p className="text-xs text-neutral-600">
                Une variante reprend la recette en remplaçant des ingrédients et/ou en
                ajoutant des étapes à la fin.
              </p>
            </div>

            {variants.map((v, k) => (
              <VariantCard
                key={v.uid}
                index={k}
                draft={v}
                onChange={(changes) => patchVariant(v.uid, changes)}
                onRemove={() => setVariants((list) => list.filter((x) => x.uid !== v.uid))}
                fromOptions={fromOptions}
                ingredients={ingredients}
                sorted={sorted}
                knownActions={knownActions}
              />
            ))}

            <button
              type="button"
              onClick={() =>
                setVariants((list) => [
                  ...list,
                  { uid: nextUid(), name: "", replacements: [], added: [] },
                ])
              }
              className={`rounded-lg border border-dashed border-white/30 py-3 text-base text-neutral-200 hover:bg-white/5 ${focusRing}`}
            >
              ＋ Ajouter une variante
            </button>
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-[#1f1f1f] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {error && (
          <p role="alert" className="mx-auto mb-2 max-w-xl text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-lg border border-white/25 py-3 text-base text-neutral-200 hover:bg-white/5 ${focusRing}`}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            className={`rounded-lg bg-white py-3 text-base font-medium text-neutral-900 hover:bg-neutral-200 ${focusRing}`}
          >
            Enregistrer
          </button>
        </div>
      </footer>
    </div>
  );
}