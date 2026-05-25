"use client";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

function MockupShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-full ${className}`}
      style={{
        borderRadius: radius["2xl"],
        backgroundImage: gradients.card.elevated,
        border: `1px solid ${colors.border.subtle}`,
        boxShadow: shadows.hero.floating,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function MockupHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div
      style={{
        padding: spacing.scale[4],
        borderBottom: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.surface.primary,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: spacing.scale[2] }}>
          <span
            className="inline-flex h-7 w-7 items-center justify-center"
            style={{
              borderRadius: radius.sm,
              backgroundImage: gradients.button.primary,
              color: colors.text.inverse,
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.medium,
            }}
          >
            F
          </span>
          <span
            style={{
              ...typography.cardTitle.desktop,
              fontSize: typography.fontSize.base,
              color: colors.text.primary,
            }}
          >
            {title}
          </span>
        </div>
        {badge ? (
          <span
            style={{
              ...typography.caption.desktop,
              color: colors.success.DEFAULT,
              padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
              borderRadius: radius.full,
              backgroundColor: colors.success.light,
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StepNav({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <div
      className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        padding: `${spacing.scale[3]} ${spacing.scale[4]} 0`,
        borderBottom: `1px solid ${colors.border.subtle}`,
      }}
    >
      <div className="flex min-w-max" style={{ gap: spacing.scale[5] }}>
        {steps.map((step, index) => (
          <span
            key={step}
            style={{
              ...typography.workflow.desktop,
              color: index === activeIndex ? colors.text.primary : colors.text.muted,
              fontWeight:
                index === activeIndex
                  ? typography.fontWeight.medium
                  : typography.fontWeight.regular,
              paddingBottom: spacing.scale[3],
              borderBottom:
                index === activeIndex
                  ? `2px solid ${colors.orange[500]}`
                  : "2px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Hero — dashboard progression inspired by DashboardHome */
export function HeroDashboardMockup() {
  const steps = ["Activité", "Logement", "Crédit", "Revenus", "Validation"];
  const documents = [
    { name: "Acte notarié — Appartement Lyon", status: "Analysé", detail: "12 montants extraits" },
    { name: "Tableau d'amortissement", status: "Analysé", detail: "8 montants extraits" },
    { name: "Relevé de compte — Loyers 2024", status: "En cours", detail: "Analyse en cours…" },
  ];

  return (
    <MockupShell>
      <MockupHeader title="Exercice 2024" badge="Enregistré" />
      <StepNav steps={steps} activeIndex={1} />
      <div style={{ padding: spacing.card.md }}>
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: spacing.scale[5] }}
        >
          <div>
            <p
              style={{
                ...typography.caption.desktop,
                color: colors.text.muted,
                letterSpacing: typography.letterSpacing.caps,
                textTransform: "uppercase",
                marginBottom: spacing.scale[1],
              }}
            >
              Avancement du dossier
            </p>
            <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary }}>
              68 % complété
            </p>
          </div>
          <span
            style={{
              ...typography.caption.desktop,
              color: colors.orange[600],
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              borderRadius: radius.full,
              backgroundColor: colors.orange[50],
            }}
          >
            3 documents analysés
          </span>
        </div>

        <div
          style={{
            height: "6px",
            borderRadius: radius.full,
            backgroundColor: colors.surface.inset,
            marginBottom: spacing.scale[6],
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "68%",
              height: "100%",
              borderRadius: radius.full,
              backgroundImage: gradients.workflow.analyzing,
            }}
          />
        </div>

        <div className="flex flex-col" style={{ gap: spacing.scale[3] }}>
          {documents.map((doc) => (
            <div
              key={doc.name}
              className="flex items-center justify-between gap-4"
              style={{
                padding: spacing.scale[4],
                borderRadius: radius.lg,
                backgroundColor: colors.surface.primary,
                border: `1px solid ${colors.border.subtle}`,
              }}
            >
              <div className="min-w-0">
                <p
                  className="truncate"
                  style={{
                    ...typography.body.desktop,
                    color: colors.text.primary,
                    fontSize: typography.fontSize.sm,
                  }}
                >
                  {doc.name}
                </p>
                <p
                  style={{
                    ...typography.caption.desktop,
                    color: colors.text.muted,
                    marginTop: spacing.scale[1],
                  }}
                >
                  {doc.status}
                </p>
              </div>
              <span
                style={{
                  ...typography.caption.desktop,
                  color: doc.status === "En cours" ? colors.orange[600] : colors.success.DEFAULT,
                  whiteSpace: "nowrap",
                }}
              >
                {doc.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

/** Upload step — inspired by DocumentUploadZone */
export function UploadMockup() {
  return (
    <MockupShell>
      <MockupHeader title="Documents" />
      <StepNav steps={["Activité", "Logement", "Crédit", "Revenus", "Validation"]} activeIndex={0} />
      <div style={{ padding: spacing.card.md }}>
        <p
          style={{
            ...typography.cardTitle.desktop,
            color: colors.text.primary,
            marginBottom: spacing.scale[2],
          }}
        >
          Déposez vos documents
        </p>
        <p
          style={{
            ...typography.body.desktop,
            color: colors.text.secondary,
            fontSize: typography.fontSize.sm,
            marginBottom: spacing.scale[5],
          }}
        >
          Acte notarié, prêt, revenus, charges…
        </p>
        <div
          className="flex flex-col items-center justify-center text-center"
          style={{
            padding: spacing.scale[10],
            borderRadius: radius.xl,
            border: `1.5px dashed ${colors.border.default}`,
            backgroundColor: colors.surface.inset,
          }}
        >
          <span
            aria-hidden
            style={{
              fontSize: typography.fontSize["2xl"],
              color: colors.orange[400],
              marginBottom: spacing.scale[3],
            }}
          >
            ↑
          </span>
          <p style={{ ...typography.body.desktop, color: colors.text.primary, fontSize: typography.fontSize.sm }}>
            Glissez vos fichiers ici
          </p>
          <p style={{ ...typography.caption.desktop, color: colors.text.muted, marginTop: spacing.scale[2] }}>
            PDF ou images — l&apos;analyse démarre automatiquement
          </p>
        </div>
        <div className="mt-4 flex flex-col" style={{ gap: spacing.scale[2] }}>
          {["Acte_notarie.pdf", "Tableau_amortissement.pdf"].map((file) => (
            <div
              key={file}
              className="flex items-center justify-between"
              style={{
                padding: spacing.scale[3],
                borderRadius: radius.md,
                border: `1px solid ${colors.border.subtle}`,
                backgroundColor: colors.surface.primary,
              }}
            >
              <span style={{ ...typography.caption.desktop, color: colors.text.primary }}>{file}</span>
              <span style={{ ...typography.caption.desktop, color: colors.orange[600] }}>Analyse…</span>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

/** AI analysis — document rows with extraction counts */
export function AnalysisMockup() {
  const rows = [
    { name: "Acte notarié", status: "Analysé", count: 12 },
    { name: "Tableau d'amortissement", status: "Analysé", count: 8 },
    { name: "Relevé bancaire — Loyers", status: "Analysé", count: 24 },
  ];

  return (
    <MockupShell>
      <MockupHeader title="Analyse IA" badge="Terminée" />
      <div style={{ padding: spacing.card.md }}>
        <p
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            marginBottom: spacing.scale[4],
          }}
        >
          Extraction automatique
        </p>
        <div className="flex flex-col" style={{ gap: spacing.scale[3] }}>
          {rows.map((row) => (
            <div
              key={row.name}
              style={{
                padding: spacing.scale[4],
                borderRadius: radius.lg,
                backgroundColor: colors.surface.primary,
                border: `1px solid ${colors.border.subtle}`,
              }}
            >
              <div className="flex items-center justify-between">
                <p style={{ ...typography.body.desktop, color: colors.text.primary, fontSize: typography.fontSize.sm }}>
                  {row.name}
                </p>
                <span style={{ ...typography.caption.desktop, color: colors.success.DEFAULT }}>
                  {row.status}
                </span>
              </div>
              <p style={{ ...typography.caption.desktop, color: colors.text.muted, marginTop: spacing.scale[2] }}>
                {row.count} montants extraits
              </p>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

/** Amortization — inspired by amortissement step */
export function AmortizationMockup() {
  const lines = [
    { label: "Immobilisation — bien principal", amount: "8 420 €" },
    { label: "Mobilier — inventaire meublé", amount: "2 180 €" },
    { label: "Travaux — répartition automatique", amount: "1 880 €" },
  ];

  return (
    <MockupShell>
      <MockupHeader title="Amortissements" />
      <StepNav steps={["Activité", "Logement", "Crédit", "Revenus", "Validation"]} activeIndex={4} />
      <div style={{ padding: spacing.card.md }}>
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: spacing.scale[5] }}
        >
          <p style={{ ...typography.cardTitle.desktop, color: colors.text.primary, fontSize: typography.fontSize.lg }}>
            Amortissements calculés
          </p>
          <span
            style={{
              ...typography.caption.desktop,
              color: colors.orange[600],
              padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
              borderRadius: radius.full,
              backgroundColor: colors.orange[50],
            }}
          >
            12 480 €
          </span>
        </div>
        <div className="flex flex-col" style={{ gap: spacing.scale[3] }}>
          {lines.map((line) => (
            <div
              key={line.label}
              className="flex items-center justify-between"
              style={{
                padding: spacing.scale[4],
                borderRadius: radius.lg,
                border: `1px solid ${colors.border.subtle}`,
                backgroundColor: colors.surface.primary,
              }}
            >
              <span style={{ ...typography.body.desktop, color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
                {line.label}
              </span>
              <span style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: typography.fontWeight.medium }}>
                {line.amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

/** Validation — inspired by ValidationHero */
export function ValidationMockup() {
  const fields = [
    { label: "Revenus locatifs", value: "18 240 €", status: "Validé" },
    { label: "Charges déductibles", value: "4 680 €", status: "Validé" },
    { label: "Intérêts d'emprunt", value: "3 120 €", status: "À confirmer" },
  ];

  return (
    <MockupShell>
      <div
        style={{
          padding: spacing.card.lg,
          backgroundImage: [
            `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
            gradients.card.elevated,
          ].join(", "),
        }}
      >
        <span
          style={{
            ...typography.caption.desktop,
            color: colors.text.accent,
            padding: `${spacing.scale[1]} ${spacing.scale[3]}`,
            borderRadius: radius.full,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.selected,
          }}
        >
          Dossier prêt
        </span>
        <p
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize.xl,
            color: colors.text.primary,
            marginTop: spacing.scale[4],
            marginBottom: spacing.scale[5],
          }}
        >
          Vérifiez avant génération
        </p>
        <div className="flex flex-col" style={{ gap: spacing.scale[3] }}>
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex items-center justify-between"
              style={{
                padding: spacing.scale[4],
                borderRadius: radius.lg,
                backgroundColor: colors.surface.primary,
                border: `1px solid ${colors.border.subtle}`,
              }}
            >
              <div>
                <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>{field.label}</p>
                <p style={{ ...typography.body.desktop, color: colors.text.primary, marginTop: spacing.scale[1] }}>
                  {field.value}
                </p>
              </div>
              <span
                style={{
                  ...typography.caption.desktop,
                  color: field.status === "Validé" ? colors.success.DEFAULT : colors.orange[600],
                }}
              >
                {field.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

/** Declaration ready — inspired by DeclarationReadyView */
export function DeclarationReadyMockup() {
  const items = [
    { label: "Liasse fiscale PDF", status: "Disponible" },
    { label: "Formulaires CERFA", status: "Disponible" },
    { label: "Accusé télétransmission EDI", status: "Disponible" },
  ];

  return (
    <MockupShell>
      <div
        className="text-center"
        style={{
          padding: spacing.card.lg,
          backgroundImage: [
            `radial-gradient(ellipse 88% 52% at 50% -8%, ${colors.orange[100]} 0%, transparent 62%)`,
            gradients.card.elevated,
          ].join(", "),
        }}
      >
        <p style={{ ...typography.caption.desktop, color: colors.text.accent }}>
          Déclaration LMNP 2024
        </p>
        <p
          style={{
            fontFamily: typography.fontFamily.display,
            fontSize: typography.fontSize["2xl"],
            color: colors.text.primary,
            marginTop: spacing.scale[4],
            marginBottom: spacing.scale[6],
          }}
        >
          Déclaration prête
        </p>
        <div className="flex flex-col text-left" style={{ gap: spacing.scale[3] }}>
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between"
              style={{
                padding: spacing.scale[4],
                borderRadius: radius.lg,
                backgroundColor: colors.surface.primary,
                border: `1px solid ${colors.border.subtle}`,
              }}
            >
              <span style={{ ...typography.body.desktop, color: colors.text.primary, fontSize: typography.fontSize.sm }}>
                {item.label}
              </span>
              <span style={{ ...typography.caption.desktop, color: colors.success.DEFAULT }}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  );
}

export const DEMO_FLOW = [
  { id: "upload", label: "Dépôt de documents", Mockup: UploadMockup },
  { id: "analysis", label: "Analyse IA", Mockup: AnalysisMockup },
  { id: "amortization", label: "Amortissements", Mockup: AmortizationMockup },
  { id: "validation", label: "Validation", Mockup: ValidationMockup },
  { id: "ready", label: "Déclaration prête", Mockup: DeclarationReadyMockup },
] as const;
