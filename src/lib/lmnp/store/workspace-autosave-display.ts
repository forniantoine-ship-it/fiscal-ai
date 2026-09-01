export type AutosaveStatus = "saved" | "saving" | "error" | "idle";

export type AutosaveDisplay = {
  label: string;
  tone: "saved" | "saving" | "error";
};

/** Honest autosave copy — never claims persistence without a bound auth user. */
export function resolveAutosaveDisplay(
  status: AutosaveStatus,
  persistenceUserId: string | null,
): AutosaveDisplay | null {
  if (!persistenceUserId) {
    if (status === "saving") {
      return { label: "Enregistrement en cours…", tone: "saving" };
    }
    return {
      label: "Non enregistré — connectez-vous pour conserver votre dossier",
      tone: "error",
    };
  }

  if (status === "idle") return null;
  if (status === "saved") return { label: "Dossier enregistré", tone: "saved" };
  if (status === "saving") return { label: "Enregistrement…", tone: "saving" };
  return { label: "Erreur de sauvegarde", tone: "error" };
}
