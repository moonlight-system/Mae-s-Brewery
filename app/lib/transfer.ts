import {
  MAX_DESCRIPTION,
  MAX_RATING,
  type Cocktail,
  type Ingredient,
  type Recipes,
  type Step,
  type Variant,
} from "./recipes";
import { usedIngredientIds, type CustomData } from "./customRecipes";

/**
 * Export / import of recipes.
 *
 * The exported file has the same shape as recipes.json ({ ingredients, cocktails }) plus a
 * small header, so a plain recipes.json can be imported too.
 */

export const EXPORT_FORMAT = "maes-brewery-recipes";
const PLACEHOLDER_COLOR = "#888888";

export type ExportFile = {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  ingredients: Record<string, Ingredient>;
  cocktails: Record<string, Cocktail>;
};

/** What was found in an imported file, cleaned up and safe to use. */
export type ParsedImport = {
  ingredients: Record<string, Ingredient>;
  cocktails: Record<string, Cocktail>;
  /** Things in the file that were not valid and are left out */
  skipped: string[];
};

export type ParseResult =
  | { ok: true; data: ParsedImport }
  | { ok: false; error: string };

export type ImportPlan = {
  /** Recipes whose id is not in the app yet */
  newRecipes: string[];
  /** Same id as one of yours, but a different content */
  changedRecipes: string[];
  /** Same id and same content: nothing to do */
  sameRecipes: string[];
  /** Ingredients that will be added (or brought back) */
  newIngredients: string[];
  /** Ingredients used by a recipe but defined nowhere: created as grey placeholders */
  placeholders: string[];
};

const has = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

// Keys that must never be used as ids (they would change an object's prototype)
const FORBIDDEN_IDS = new Set(["__proto__", "constructor", "prototype"]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/* ---------- Export ---------- */

/** The given recipes plus the ingredients they use, with their current names and colors. */
export function buildExport(recipes: Recipes, ids: string[]): ExportFile {
  const cocktails: Record<string, Cocktail> = {};
  const used = new Set<string>();

  for (const id of ids) {
    const cocktail = recipes.cocktails[id];
    if (!cocktail) continue;
    cocktails[id] = cocktail;
    usedIngredientIds(cocktail).forEach((i) => used.add(i));
  }

  const ingredients: Record<string, Ingredient> = {};
  for (const id of used) {
    if (has(recipes.ingredients, id)) ingredients[id] = recipes.ingredients[id];
  }

  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    ingredients,
    cocktails,
  };
}

/* ---------- Reading an imported file ---------- */

function cleanStep(raw: unknown): Step | null {
  if (!isRecord(raw)) return null;

  if (raw.type === "action") {
    return typeof raw.action === "string" && raw.action.trim()
      ? { type: "action", action: raw.action.trim() }
      : null;
  }

  if (raw.type === "ingredient" && typeof raw.ingredient === "string" && raw.ingredient) {
    if (FORBIDDEN_IDS.has(raw.ingredient)) return null;
    const step: Extract<Step, { type: "ingredient" }> = {
      type: "ingredient",
      ingredient: raw.ingredient,
    };
    if (raw.mode === "top" || raw.mode === "thin") {
      step.mode = raw.mode; // these layers have no quantity
    } else {
      if (typeof raw.quantity === "number" && Number.isFinite(raw.quantity) && raw.quantity > 0) {
        step.quantity = raw.quantity;
      }
      if (typeof raw.unit === "string" && raw.unit) step.unit = raw.unit;
    }
    return step;
  }

  return null;
}

/** Null when it isn't a list of valid steps. */
function cleanSteps(raw: unknown): Step[] | null {
  if (!Array.isArray(raw)) return null;
  const steps: Step[] = [];
  for (const item of raw) {
    const step = cleanStep(item);
    if (!step) return null;
    steps.push(step);
  }
  return steps;
}

/** The cleaned variant, or a message saying what is wrong with it. */
function cleanVariant(raw: unknown): Variant | string {
  if (!isRecord(raw)) return "variante invalide";
  if (typeof raw.name !== "string" || !raw.name.trim()) return "variante sans nom";

  const variant: Variant = { name: raw.name.trim() };
  const where = `variante « ${variant.name} »`;

  if (raw.replace !== undefined) {
    if (!isRecord(raw.replace)) return `${where} : remplacements invalides`;
    const replace: Record<string, string> = {};
    for (const [from, to] of Object.entries(raw.replace)) {
      if (FORBIDDEN_IDS.has(from) || typeof to !== "string" || !to || FORBIDDEN_IDS.has(to)) {
        return `${where} : remplacement invalide`;
      }
      replace[from] = to;
    }
    variant.replace = replace;
  }

  for (const key of ["add", "steps"] as const) {
    if (raw[key] === undefined) continue;
    const steps = cleanSteps(raw[key]);
    if (!steps) return `${where} : étapes invalides`;
    variant[key] = steps;
  }

  return variant;
}

/** The cleaned recipe, or a message saying what is wrong with it. */
function cleanCocktail(raw: unknown): Cocktail | string {
  if (!isRecord(raw)) return "recette invalide";
  if (typeof raw.name !== "string" || !raw.name.trim()) return "recette sans nom";

  const steps = cleanSteps(raw.steps);
  if (!steps) return "étapes invalides";
  if (steps.length === 0) return "aucune étape";

  const cocktail: Cocktail = { name: raw.name.trim(), steps };
  if (raw.type === "cocktail" || raw.type === "shot") cocktail.type = raw.type;
  if (typeof raw.description === "string" && raw.description.trim()) {
    cocktail.description = raw.description.trim().slice(0, MAX_DESCRIPTION);
  }
  if (
    typeof raw.rating === "number" &&
    Number.isFinite(raw.rating) &&
    raw.rating >= 0 &&
    raw.rating <= MAX_RATING
  ) {
    cocktail.rating = raw.rating;
  }

  if (raw.variants !== undefined) {
    if (!isRecord(raw.variants)) return "variantes invalides";
    const variants: Record<string, Variant> = {};
    for (const [id, rawVariant] of Object.entries(raw.variants)) {
      if (FORBIDDEN_IDS.has(id)) return "variante invalide";
      const variant = cleanVariant(rawVariant);
      if (typeof variant === "string") return variant;
      variants[id] = variant;
    }
    if (Object.keys(variants).length > 0) cocktail.variants = variants;
  }

  return cocktail;
}

function cleanIngredient(raw: unknown): Ingredient | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  const color =
    typeof raw.color === "string" && /^#[0-9a-f]{3,8}$/i.test(raw.color.trim())
      ? raw.color.trim()
      : PLACEHOLDER_COLOR;
  return { name: raw.name.trim(), color };
}

/** Reads the text of a file: checks it, drops what isn't valid and says how much was dropped. */
export function parseImport(text: string): ParseResult {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, error: "Ce texte n’est pas du JSON valide." };
  }

  if (!isRecord(root) || !isRecord(root.cocktails)) {
    return { ok: false, error: "Aucune recette trouvée dans ce fichier." };
  }

  const skipped: string[] = [];

  const ingredients: Record<string, Ingredient> = {};
  if (isRecord(root.ingredients)) {
    for (const [id, raw] of Object.entries(root.ingredients)) {
      const ingredient = cleanIngredient(raw);
      if (FORBIDDEN_IDS.has(id) || !ingredient) {
        skipped.push(`Ingrédient « ${id} » invalide`);
      } else {
        ingredients[id] = ingredient;
      }
    }
  }

  const cocktails: Record<string, Cocktail> = {};
  for (const [id, raw] of Object.entries(root.cocktails)) {
    const cocktail = FORBIDDEN_IDS.has(id) ? "identifiant interdit" : cleanCocktail(raw);
    if (typeof cocktail === "string") {
      skipped.push(`Recette « ${id} » ignorée : ${cocktail}`);
    } else {
      cocktails[id] = cocktail;
    }
  }

  if (Object.keys(cocktails).length === 0) {
    return {
      ok: false,
      error: skipped.length
        ? "Aucune recette valide dans ce fichier."
        : "Ce fichier ne contient aucune recette.",
    };
  }

  return { ok: true, data: { ingredients, cocktails, skipped } };
}

/* ---------- Merging into the app ---------- */

/** JSON with sorted keys, to compare two recipes whatever the order of their fields. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Adds the imported recipes to the user's own data.
 *
 * - A recipe with a new id is added.
 * - A recipe identical to one you have is skipped.
 * - A recipe with the same id as one of yours but a different content is added as a copy
 *   named "… (importée)", or replaces yours when `replaceChanged` is true.
 * - Ingredients you already have are never overwritten by the file's version.
 *
 * `current` is what the app shows now (recipes.json + the user's changes).
 */
export function runImport(
  custom: CustomData,
  parsed: ParsedImport,
  current: Recipes,
  replaceChanged: boolean,
  now: number = Date.now()
): { next: CustomData; plan: ImportPlan } {
  const next: CustomData = {
    cocktails: { ...custom.cocktails },
    ingredients: { ...custom.ingredients },
    hidden: [...custom.hidden],
    hiddenIngredients: [...custom.hiddenIngredients],
  };
  const plan: ImportPlan = {
    newRecipes: [],
    changedRecipes: [],
    sameRecipes: [],
    newIngredients: [],
    placeholders: [],
  };

  const unhideIngredient = (id: string) => {
    next.hiddenIngredients = next.hiddenIngredients.filter((h) => h !== id);
  };

  // Ingredients from the file that the app doesn't show yet (this includes ones you deleted)
  for (const [id, ingredient] of Object.entries(parsed.ingredients)) {
    if (has(current.ingredients, id)) continue;
    next.ingredients[id] = ingredient;
    unhideIngredient(id);
    plan.newIngredients.push(id);
  }

  // Ingredients that recipes use but nothing defines
  const referenced = new Set<string>();
  for (const cocktail of Object.values(parsed.cocktails)) {
    usedIngredientIds(cocktail).forEach((i) => referenced.add(i));
  }
  for (const id of referenced) {
    if (has(current.ingredients, id) || has(parsed.ingredients, id)) continue;
    if (next.hiddenIngredients.includes(id)) {
      unhideIngredient(id); // you deleted it earlier: bring it back as it was
      continue;
    }
    next.ingredients[id] = { name: id, color: PLACEHOLDER_COLOR };
    plan.placeholders.push(id);
  }

  // Recipes
  let copies = 0;
  for (const [id, cocktail] of Object.entries(parsed.cocktails)) {
    const existing = has(current.cocktails, id) ? current.cocktails[id] : undefined;

    if (!existing) {
      next.cocktails[id] = cocktail;
      next.hidden = next.hidden.filter((h) => h !== id); // a deleted built-in recipe comes back
      plan.newRecipes.push(id);
    } else if (stableStringify(existing) === stableStringify(cocktail)) {
      plan.sameRecipes.push(id);
    } else {
      plan.changedRecipes.push(id);
      if (replaceChanged) {
        next.cocktails[id] = cocktail;
      } else {
        next.cocktails[`custom-${now.toString(36)}-${copies++}`] = {
          ...cocktail,
          name: `${cocktail.name} (importée)`,
        };
      }
    }
  }

  return { next, plan };
}