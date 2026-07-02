/** Langage courant pour les composants (F-014 UX — Principe 2). */
const NOM_COURANT: Record<string, string> = {
  "Gros œuvre": "Structure du bâtiment",
  "Toiture": "Toiture",
  "Façade / ravalement": "Façade",
  "Menuiseries extérieures": "Menuiseries extérieures",
  "Installations électriques": "Installations électriques",
  "Plomberie / sanitaires": "Plomberie et sanitaires",
  "Étanchéité": "Étanchéité",
  "Chauffage": "Chauffage",
  "Agencements intérieurs": "Agencements intérieurs",
  Mobilier: "Mobilier",
};

export function toNomCourant(nomTechnique: string): string {
  return NOM_COURANT[nomTechnique] ?? nomTechnique;
}
