"use client";

import { useState, type FormEvent } from "react";
import { SectionHeading } from "./ui/SectionHeading";
import { Button } from "./ui/Button";

const profiles = [
  "Salarié / Cadre",
  "Indépendant / Freelance",
  "Dirigeant de société",
  "Investisseur immobilier",
  "Profession libérale",
  "Retraité",
  "Autre",
];

export function LeadForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <section id="contact" className="border-t border-white/5 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              align="left"
              label="Contact"
              title="Obtenez votre diagnostic fiscal gratuit"
              description="Remplissez le formulaire en 2 minutes. Un expert vous recontacte sous 24 h avec une estimation personnalisée de vos économies fiscales."
            />
            <ul className="mt-8 space-y-4">
              {[
                "Analyse IA + validation expert",
                "Estimation chiffrée de vos économies",
                "Sans engagement, 100 % confidentiel",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-zinc-400">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 sm:p-8">
            {submitted ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400">
                  ✓
                </div>
                <h3 className="text-xl font-semibold">Demande envoyée !</h3>
                <p className="mt-2 max-w-sm text-sm text-zinc-400">
                  Merci pour votre confiance. Un conseiller Fiscal AI vous contactera sous 24 h
                  ouvrées avec votre diagnostic personnalisé.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="prenom" className="mb-1.5 block text-sm font-medium text-zinc-300">
                      Prénom *
                    </label>
                    <input
                      id="prenom"
                      name="prenom"
                      type="text"
                      required
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                      placeholder="Jean"
                    />
                  </div>
                  <div>
                    <label htmlFor="nom" className="mb-1.5 block text-sm font-medium text-zinc-300">
                      Nom *
                    </label>
                    <input
                      id="nom"
                      name="nom"
                      type="text"
                      required
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                      placeholder="Dupont"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Email professionnel *
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                    placeholder="jean.dupont@email.com"
                  />
                </div>

                <div>
                  <label htmlFor="telephone" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Téléphone
                  </label>
                  <input
                    id="telephone"
                    name="telephone"
                    type="tel"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                    placeholder="06 12 34 56 78"
                  />
                </div>

                <div>
                  <label htmlFor="profil" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Votre profil *
                  </label>
                  <select
                    id="profil"
                    name="profil"
                    required
                    defaultValue=""
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                  >
                    <option value="" disabled>
                      Sélectionnez votre profil
                    </option>
                    {profiles.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="revenus" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Revenus annuels estimés
                  </label>
                  <select
                    id="revenus"
                    name="revenus"
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                  >
                    <option value="">Préfère ne pas préciser</option>
                    <option value="<50k">Moins de 50 000 €</option>
                    <option value="50-100k">50 000 € – 100 000 €</option>
                    <option value="100-200k">100 000 € – 200 000 €</option>
                    <option value=">200k">Plus de 200 000 €</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-zinc-300">
                    Message (optionnel)
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                    placeholder="Décrivez brièvement votre situation fiscale..."
                  />
                </div>

                <p className="text-xs text-zinc-500">
                  En soumettant ce formulaire, vous acceptez notre politique de confidentialité.
                  Vos données ne seront jamais partagées avec des tiers.
                </p>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Envoi en cours..." : "Recevoir mon diagnostic gratuit"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
