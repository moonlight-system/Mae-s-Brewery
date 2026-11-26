import {
  recipes as bundled,
  type Cocktail,
  type Ingredient,
  type Recipes,
  type Step,
} from "./recipes";
import { EMPTY_ORG, cleanOrganisation, type Organisation } from "./organize";

/**
 * recipes.json is compiled into the app, so it can't be written to on a phone.
 * Everything the user adds, edits or deletes is kept here instead, in the webview's
 * localStorage, and merged on top of recipes.json when the app starts.
 */
const KEY = "maes-brewery:custom-recipes:v1";

export type CustomData = {
  /** New recipes, plus edited copies of bundled ones (same id as the bundled recipe) */
  cocktails: Record<string, Cocktail>;
  /**
   * Ingredients created by the user, plus edited copies of bundled ones (same id:
   * a new name and/or color replaces the bundled one everywhere)
   */
  ingredients: Record<string, Ingredient>;
  /** Ids of bundled recipes the user deleted */
  hidden: string[];
  /** Ids of bundled ingredients the user deleted */
  hiddenIngredients: string[];
  /** Folders and ordering of the recipe list */
  organisation: Organisation;
};

export const EMPTY_CUSTOM: CustomData = {
  cocktails: {},
  ingredients: {},
  hidden: [],
  hiddenIngredients: [],
  organisation: EMPTY_ORG,
};

export function loadCustom(): CustomData {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_CUSTOM;
    const parsed = JSON.parse(raw) as Partial<CustomData>;
    return {
      cocktails: parsed.cocktails ?? {},
      ingredients: parsed.ingredients ?? {},
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      hiddenIngredients: Array.isArray(parsed.hiddenIngredients)
        ? parsed.hiddenIngredients
        : [],
      organisation: cleanOrganisation((parsed as { organisation?: unknown }).organisation),
    };
  } catch {
    return EMPTY_CUSTOM;
  }
}

export function saveCustom(data: CustomData) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Could not save custom recipes", e);
  }
}

/** True for a recipe that comes from recipes.json (as opposed to one the user created). */
export function isBundled(id: string) {
  return Object.prototype.hasOwnProperty.call(bundled.cocktails, id);
}

/** True for an ingredient that comes from recipes.json. */
export function isBundledIngredient(id: string) {
  return Object.prototype.hasOwnProperty.call(bundled.ingredients, id);
}

/** Ids of every ingredient a recipe uses, in its steps and in its variants. */
export function usedIngredientIds(cocktail: Cocktail): string[] {
  const ids = new Set<string>();
  const fromSteps = (steps?: Step[]) =>
    steps?.forEach((s) => {
      if (s.type === "ingredient") ids.add(s.ingredient);
    });

  fromSteps(cocktail.steps);
  for (const variant of Object.values(cocktail.variants ?? {})) {
    fromSteps(variant.steps);
    fromSteps(variant.add);
    Object.values(variant.replace ?? {}).forEach((id) => ids.add(id));
  }
  return [...ids];
}

/**
 * Brings back every deleted built-in recipe, and the deleted built-in ingredients
 * that those recipes need (otherwise they would show up with a grey, unnamed layer).
 */
export function restoreHiddenRecipes(custom: CustomData): CustomData {
  const needed = new Set<string>();
  for (const id of custom.hidden) {
    const recipe = bundled.cocktails[id];
    if (recipe) usedIngredientIds(recipe).forEach((i) => needed.add(i));
  }
  return {
    ...custom,
    hidden: [],
    hiddenIngredients: custom.hiddenIngredients.filter((i) => !needed.has(i)),
  };
}

/** recipes.json + the user's changes: edits replace, deletions hide, new recipes go last. */
export function mergeRecipes(custom: CustomData): Recipes {
  const cocktails: Record<string, Cocktail> = {};

  for (const id of Object.keys(bundled.cocktails)) {
    if (custom.hidden.includes(id)) continue;
    cocktails[id] = custom.cocktails[id] ?? bundled.cocktails[id];
  }
  for (const id of Object.keys(custom.cocktails)) {
    if (!(id in cocktails) && !custom.hidden.includes(id)) {
      cocktails[id] = custom.cocktails[id];
    }
  }

  const ingredients: Record<string, Ingredient> = {
    ...bundled.ingredients,
    ...custom.ingredients,
  };
  for (const id of custom.hiddenIngredients) delete ingredients[id];

  return { ingredients, cocktails };
}