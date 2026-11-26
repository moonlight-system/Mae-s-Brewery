export type Folder = { name: string };

export type Organisation = {
  folders: Record<string, Folder>;
  /** Display order of the folders */
  folderOrder: string[];
  /** recipe id -> folder id (absent = not in a folder) */
  recipeFolder: Record<string, string>;
  /** Display order of recipes (ids not listed come after, in their default order) */
  recipeOrder: string[];
};

export const EMPTY_ORG: Organisation = {
  folders: {},
  folderOrder: [],
  recipeFolder: {},
  recipeOrder: [],
};

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads stored data defensively. */
export function cleanOrganisation(raw: unknown): Organisation {
  if (!isRec(raw)) return EMPTY_ORG;

  const folders: Record<string, Folder> = {};
  if (isRec(raw.folders)) {
    for (const [id, f] of Object.entries(raw.folders)) {
      if (isRec(f) && typeof f.name === "string") folders[id] = { name: f.name };
    }
  }
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const recipeFolder: Record<string, string> = {};
  if (isRec(raw.recipeFolder)) {
    for (const [r, f] of Object.entries(raw.recipeFolder)) {
      if (typeof f === "string" && has(folders, f)) recipeFolder[r] = f;
    }
  }

  return {
    folders,
    folderOrder: strings(raw.folderOrder).filter((id) => has(folders, id)),
    recipeFolder,
    recipeOrder: strings(raw.recipeOrder),
  };
}

/* ---------- Reading ---------- */

export function sortByOrder(ids: string[], order: string[]): string[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return ids
    .map((id, i) => ({ id, k: pos.get(id) ?? order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.id);
}

function allFolderIds(org: Organisation): string[] {
  return [
    ...org.folderOrder,
    ...Object.keys(org.folders).filter((id) => !org.folderOrder.includes(id)),
  ];
}

export function buildTree(ids: string[], org: Organisation, keepEmptyFolders: boolean) {
  const ordered = sortByOrder(ids, org.recipeOrder);
  const folders = allFolderIds(org)
    .map((id) => ({
      id,
      name: org.folders[id].name,
      ids: ordered.filter((r) => org.recipeFolder[r] === id),
    }))
    .filter((f) => keepEmptyFolders || f.ids.length > 0);
  const loose = ordered.filter((r) => !org.recipeFolder[r]);
  return { folders, loose };
}

/* ---------- Changing ---------- */

export function createFolder(org: Organisation, name: string): Organisation {
  const id = `folder-${Date.now().toString(36)}`;
  return {
    ...org,
    folders: { ...org.folders, [id]: { name } },
    folderOrder: [...allFolderIds(org), id],
  };
}

export function renameFolder(org: Organisation, id: string, name: string): Organisation {
  if (!has(org.folders, id)) return org;
  return { ...org, folders: { ...org.folders, [id]: { name } } };
}

/** Recipes of a deleted folder go back to the main list. */
export function deleteFolder(org: Organisation, id: string): Organisation {
  const folders = { ...org.folders };
  delete folders[id];
  const recipeFolder = Object.fromEntries(
    Object.entries(org.recipeFolder).filter(([, f]) => f !== id)
  );
  return {
    ...org,
    folders,
    folderOrder: org.folderOrder.filter((f) => f !== id),
    recipeFolder,
  };
}

export function moveToFolder(org: Organisation, recipeId: string, folderId: string | null): Organisation {
  const recipeFolder = { ...org.recipeFolder };
  if (folderId && has(org.folders, folderId)) recipeFolder[recipeId] = folderId;
  else delete recipeFolder[recipeId];
  return { ...org, recipeFolder };
}

/** Swaps a recipe with its neighbour among `siblings` (the ids shown together, in order). */
export function moveRecipe(
  org: Organisation,
  allIds: string[],
  id: string,
  siblings: string[],
  delta: -1 | 1
): Organisation {
  const i = siblings.indexOf(id);
  const other = siblings[i + delta];
  if (i < 0 || !other) return org;
  const full = sortByOrder(allIds, org.recipeOrder);
  const a = full.indexOf(id);
  const b = full.indexOf(other);
  [full[a], full[b]] = [full[b], full[a]];
  return { ...org, recipeOrder: full };
}

export function moveFolder(org: Organisation, id: string, delta: -1 | 1): Organisation {
  const order = allFolderIds(org);
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return org;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...org, folderOrder: order };
}