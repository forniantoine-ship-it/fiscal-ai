"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { Input } from "@/design-system/components/Input";
import { PublicLayout } from "@/design-system/layouts/PublicLayout";
import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  logAuthRedirectDashboard,
  signUpWithSession,
} from "@/lib/lmnp/auth/auth-session";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

export function InscriptionForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);

    try {
      const result = await signUpWithSession(email, password);

      if (!result.ok) {
        alert(result.error);
        return;
      }

      logAuthRedirectDashboard();
      router.push(LMNP_ROUTES.dashboard);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <div
        className="mx-auto flex min-h-[60vh] flex-col items-center justify-center"
        style={{ maxWidth: "420px", paddingBlock: spacing.scale[16] }}
      >
        <Link
          href="/"
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize["2xl"],
            color: colors.text.primary,
            marginBottom: spacing.scale[10],
            textDecoration: "none",
          }}
        >
          Fiscal AI
        </Link>

        <div
          className="w-full"
          style={{
            padding: spacing.card.xl,
            borderRadius: radius["2xl"],
            backgroundColor: colors.surface.primary,
            border: `1px solid ${colors.border.subtle}`,
            boxShadow: shadows.card.default,
          }}
        >
          <h1
            style={{
              fontFamily: typography.fontFamily.display,
              fontSize: typography.fontSize["2xl"],
              fontWeight: typography.fontWeight.regular,
              color: colors.text.primary,
              marginBottom: spacing.scale[2],
            }}
          >
            Commencer ma déclaration
          </h1>
          <p
            style={{
              ...typography.body.desktop,
              color: colors.text.secondary,
              marginBottom: spacing.scale[8],
            }}
          >
            Créez votre espace et déposez vos documents.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: spacing.scale[5] }}>
            <div>
              <label
                htmlFor="email"
                style={{
                  ...typography.caption.desktop,
                  color: colors.text.muted,
                  display: "block",
                  marginBottom: spacing.scale[2],
                }}
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{
                  ...typography.caption.desktop,
                  color: colors.text.muted,
                  display: "block",
                  marginBottom: spacing.scale[2],
                }}
              >
                Mot de passe
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Création en cours…" : "Commencer ma déclaration"}
            </Button>
          </form>

          <p
            className="text-center"
            style={{ ...typography.caption.desktop, color: colors.text.muted, marginTop: spacing.scale[6] }}
          >
            Déjà un compte ?{" "}
            <Link href={LMNP_ROUTES.login} style={{ color: colors.text.accent }}>
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
