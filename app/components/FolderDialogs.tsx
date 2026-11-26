"use client";

import { useState } from "react";
import type { Organisation } from "../lib/organize";
import Dialog from "./Dialog";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";
const button = `w-full rounded-lg px-4 py-3 text-center text-base ${focusRing}`;
const primary = `${button} bg-white font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-40`;
const secondary = `${button} border border-white/25 text-neutral-200 hover:bg-white/5`;
const field =
  "w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2.5 text-base text-neutral-100 placeholder:text-neutral-600 focus:border-white/50 focus:outline-none";

export type FolderDialogState =
  | { kind: "create" }
  | { kind: "rename"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "move"; recipeId: string }
  | null;

function NameDialog({
  title,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const ok = name.trim().length > 0;
  return (
    <Dialog label={title} onClose={onClose}>
      <p className="px-3 pb-3 pt-2 text-base">{title}</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ok) onSubmit(name.trim());
        }}
        placeholder="Nom du dossier"
        aria-label="Nom du dossier"
        className={field}
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className={secondary}>
          Annuler
        </button>
        <button type="button" disabled={!ok} onClick={() => onSubmit(name.trim())} className={primary}>
          OK
        </button>
      </div>
    </Dialog>
  );
}

export default function FolderDialogs({
  state,
  org,
  recipeName,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onMove,
}: {
  state: FolderDialogState;
  org: Organisation;
  /** Name of the recipe being moved */
  recipeName?: string;
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (recipeId: string, folderId: string | null) => void;
}) {
  if (!state) return null;

  if (state.kind === "create") {
    return <NameDialog title="Nouveau dossier" initial="" onSubmit={onCreate} onClose={onClose} />;
  }

  if (state.kind === "rename") {
    const folder = org.folders[state.id];
    if (!folder) return null;
    return (
      <NameDialog
        key={state.id}
        title="Renommer le dossier"
        initial={folder.name}
        onSubmit={(name) => onRename(state.id, name)}
        onClose={onClose}
      />
    );
  }

  if (state.kind === "delete") {
    const folder = org.folders[state.id];
    if (!folder) return null;
    return (
      <Dialog label="Supprimer le dossier" onClose={onClose}>
        <p className="px-3 pb-1 pt-2 text-base">Supprimer «&nbsp;{folder.name}&nbsp;» ?</p>
        <p className="px-3 pb-3 text-sm text-neutral-400">
          Les recettes qu’il contient ne sont pas supprimées : elles retournent dans la liste.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={secondary}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onDelete(state.id)}
            className={`${button} bg-red-500 font-medium text-white hover:bg-red-400`}
          >
            Supprimer
          </button>
        </div>
      </Dialog>
    );
  }

  // move
  const current = org.recipeFolder[state.recipeId] ?? null;
  const folderIds = [
    ...org.folderOrder,
    ...Object.keys(org.folders).filter((id) => !org.folderOrder.includes(id)),
  ];
  const row = (active: boolean) =>
    `flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-base ${focusRing} ${
      active ? "bg-white/10 text-white" : "text-neutral-200 hover:bg-white/5"
    }`;

  return (
    <Dialog label="Déplacer vers un dossier" onClose={onClose}>
      <p className="truncate px-3 pb-2 pt-2 text-sm text-neutral-400">
        Déplacer «&nbsp;{recipeName}&nbsp;»
      </p>
      <button type="button" onClick={() => onMove(state.recipeId, null)} className={row(current === null)}>
        Aucun dossier {current === null && "✓"}
      </button>
      {folderIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onMove(state.recipeId, id)}
          className={row(current === id)}
        >
          <span className="truncate">{org.folders[id].name}</span>
          {current === id && "✓"}
        </button>
      ))}
      {folderIds.length === 0 && (
        <p className="px-4 py-2 text-sm text-neutral-500">
          Créez d’abord un dossier avec « Nouveau dossier ».
        </p>
      )}
      <button type="button" onClick={onClose} className={`${secondary} mt-2`}>
        Annuler
      </button>
    </Dialog>
  );
}