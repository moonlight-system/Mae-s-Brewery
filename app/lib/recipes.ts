import raw from "../recipes.json";

/** "top": fills a quarter of the glass. "thin": a thin layer (sugar, zest...). */
export type StepMode = "top" | "thin";

export type Step =
  | {
      type: "ingredient";
      ingredient: string;
      quantity?: number;
      unit?: string;
      mode?: StepMode;
    }
  | { type: "action"; action: string };

export type Variant = {
  name: string;
  replace?: Record<string, string>;
  add?: Step[];
  steps?: Step[];
};

export type Cocktail = {
  name: string;
  type?: "cocktail" | "shot";
  /** Short text shown under the name */
  description?: string;
  /** Number of stars, between 0 and MAX_RATING */
  rating?: number;
  steps: Step[];
  variants?: Record<string, Variant>;
};

export type Ingredient = { name: string; color: string };

export type Recipes = {
  ingredients: Record<string, Ingredient>;
  cocktails: Record<string, Cocktail>;
};

// TypeScript infers plain `string` for "type" in the JSON, so we assert the shape once here.
export const recipes = raw as unknown as Recipes;

const warned = new Set<string>();

/** Applies a variant (replace / add / full steps override) on top of the base cocktail. */
export function resolveVariant(cocktail: Cocktail, variantId?: string) {
  // A recipe without a "steps" array (a typo such as "step") shouldn't crash the page
  const baseSteps = cocktail.steps ?? [];
  if (!cocktail.steps && !warned.has(cocktail.name)) {
    warned.add(cocktail.name);
    console.warn(`recipes.json: "${cocktail.name}" has no "steps" array (typo?)`);
  }

  const variant = variantId ? cocktail.variants?.[variantId] : undefined;
  if (!variant) return { name: cocktail.name, steps: baseSteps };

  let steps = variant.steps ?? baseSteps;

  const replace = variant.replace;
  if (replace) {
    steps = steps.map((s) =>
      s.type === "ingredient" && replace[s.ingredient]
        ? { ...s, ingredient: replace[s.ingredient] }
        : s
    );
  }

  if (variant.add) steps = [...steps, ...variant.add];

  return { name: variant.name, steps };
}

/* ---------- Glass layout ---------- */

/** Height of a glass on a wide screen. On a given screen, every glass is the same height. */
export const GLASS_PX = 440;

export const MAX_RATING = 5;
export const MAX_DESCRIPTION = 140;

const TOP_SHARE = 0.25; // a "top with" layer takes this share of the glass
const THIN_SHARE = 0.04; // a "thin layer" takes this share (about 17 px on a wide screen)

const MIN_PX = 40; // smallest bar, so its label (and a note next to it) always fits
const DEFAULT_CL = 2; // weight of an ingredient that has no quantity

export type Bar = {
  key: string;
  name: string;
  color: string;
  quantity?: string;
  bottom: number;
  height: number;
};

export type Note = {
  key: string;
  text: string;
  bottom: number;
  /** "start" / "end" notes sit before the first or after the last bar, outside the liquid */
  placement: "start" | "middle" | "end";
};

export type GlassLayout = { height: number; bars: Bar[]; notes: Note[] };

/**
 * Splits the glass height between the bars in proportion to their quantities.
 * A bar that would end up thinner than MIN_PX gets MIN_PX, and the others share what is left.
 */
function proportionalHeights(weights: number[], glassHeight: number): number[] {
  const bars = weights.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0);
  const fixed = new Set<number>();

  for (;;) {
    const free = bars.filter((i) => !fixed.has(i));
    if (free.length === 0) break;
    const remaining = glassHeight - fixed.size * MIN_PX;
    const totalWeight = free.reduce((sum, i) => sum + weights[i], 0);
    const tooThin = free.filter(
      (i) => (weights[i] / totalWeight) * remaining < MIN_PX
    );
    if (tooThin.length === 0) break;
    tooThin.forEach((i) => fixed.add(i));
  }

  const free = bars.filter((i) => !fixed.has(i));
  const remaining = glassHeight - fixed.size * MIN_PX;
  const totalWeight = free.reduce((sum, i) => sum + weights[i], 0);

  return weights.map((w, i) =>
    w <= 0 ? 0 : fixed.has(i) ? MIN_PX : (w / totalWeight) * remaining
  );
}

type Kind = "none" | "normal" | StepMode;

/**
 * "top" and "thin" layers get a fixed share of the glass; the other layers split what
 * is left in proportion to their quantities.
 */
function barHeights(kinds: Kind[], weights: number[], glassHeight: number): number[] {
  const out = kinds.map(() => 0);
  const fixedIdx: number[] = [];
  const normalIdx: number[] = [];

  kinds.forEach((kind, i) => {
    if (kind === "top") {
      out[i] = TOP_SHARE * glassHeight;
      fixedIdx.push(i);
    } else if (kind === "thin") {
      out[i] = THIN_SHARE * glassHeight;
      fixedIdx.push(i);
    } else if (kind === "normal") {
      normalIdx.push(i);
    }
  });

  let fixedTotal = fixedIdx.reduce((sum, i) => sum + out[i], 0);

  if (normalIdx.length === 0) {
    // Only top / thin layers: stretch them to fill the glass
    if (fixedTotal > 0) fixedIdx.forEach((i) => (out[i] *= glassHeight / fixedTotal));
    return out;
  }

  // Many "top" layers must not squeeze the other ones out
  const room = Math.max(glassHeight - normalIdx.length * MIN_PX, glassHeight * 0.2);
  if (fixedTotal > room) {
    fixedIdx.forEach((i) => (out[i] *= room / fixedTotal));
    fixedTotal = room;
  }

  const shared = proportionalHeights(
    kinds.map((k, i) => (k === "normal" ? weights[i] : 0)),
    glassHeight - fixedTotal
  );
  normalIdx.forEach((i) => (out[i] = shared[i]));
  return out;
}

/**
 * Steps are poured bottom to top, in order.
 * Ingredients become bars; actions become notes sitting on the boundary between two bars.
 */
export function buildLayout(
  steps: Step[],
  ingredients: Record<string, Ingredient>,
  glassHeight: number = GLASS_PX
): GlassLayout {
  const heights = barHeights(
    steps.map((s): Kind => (s.type === "ingredient" ? (s.mode ?? "normal") : "none")),
    steps.map((s) => (s.type === "ingredient" ? s.quantity || DEFAULT_CL : 0)),
    glassHeight
  );

  const bars: Bar[] = [];
  const notes: Note[] = [];
  let offset = 0;

  steps.forEach((step, i) => {
    if (step.type === "ingredient") {
      const info = ingredients[step.ingredient];
      const height = heights[i];
      bars.push({
        key: `${i}-${step.ingredient}`,
        name: info?.name ?? step.ingredient,
        color: info?.color ?? "#888888",
        quantity:
          step.mode === "top"
            ? "à compléter"
            : step.mode === "thin"
              ? "fine couche"
              : step.quantity
                ? `${step.quantity}${step.unit ? ` ${step.unit}` : ""}`
                : undefined,
        bottom: offset,
        height,
      });
      offset += height;
    } else {
      const last = notes[notes.length - 1];
      if (last && last.bottom === offset) {
        // Two actions in a row share the same boundary: merge their labels.
        last.text += `, ${step.action.toLowerCase()}`;
      } else {
        notes.push({
          key: `${i}-${step.action}`,
          text: step.action,
          bottom: offset,
          placement: "middle",
        });
      }
    }
  });

  notes.forEach((n) => {
    n.placement = n.bottom === 0 ? "start" : n.bottom === offset ? "end" : "middle";
  });

  return { height: offset, bars, notes };
}