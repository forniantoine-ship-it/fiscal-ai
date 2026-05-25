"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { colors } from "@/design-system/theme/colors";
import { gradients } from "@/design-system/theme/gradients";
import { motions } from "@/design-system/theme/motions";
import { radius } from "@/design-system/theme/radius";
import { shadows } from "@/design-system/theme/shadows";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";

const NAV_LINKS = [
  { label: "Fonctionnalités", href: "/#fonctionnalites" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Ressources", href: "/ressources" },
  { label: "À propos", href: "/a-propos" },
  { label: "Contact", href: "/contact" },
] as const;

const GUTTER = `clamp(${spacing.gutter.mobile}, 4vw, ${spacing.gutter.wide})`;

const FOOTER_LINKS = {
  product: [
    { label: "Fonctionnalités", href: "/#fonctionnalites" },
    { label: "Tarifs", href: "/tarifs" },
    { label: "Essai gratuit", href: "/essayer" },
  ],
  company: [
    { label: "À propos", href: "/a-propos" },
    { label: "Contact", href: "/contact" },
    { label: "Ressources", href: "/ressources" },
  ],
  legal: [
    { label: "Mentions légales", href: "/mentions-legales" },
    { label: "Confidentialité", href: "/confidentialite" },
    { label: "CGU", href: "/cgu" },
  ],
} as const;

type PublicLayoutProps = {
  children: ReactNode;
};

type PrimaryCtaProps = {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
};

function PrimaryCta({ href, children, className = "", onClick }: PrimaryCtaProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const backgroundImage = pressed
    ? gradients.button.primaryPressed
    : hovered
      ? gradients.button.primaryHover
      : gradients.button.primary;

  const boxShadow = hovered
    ? shadows.button.primaryHover
    : shadows.button.primary;

  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      className={`inline-flex items-center justify-center whitespace-nowrap ${className}`}
      style={{
        ...typography.button.desktop,
        color: colors.text.inverse,
        backgroundImage,
        borderRadius: radius.full,
        padding: `${spacing.scale[3]} ${spacing.scale[6]}`,
        boxShadow,
        transition: motions.hover.button,
      }}
    >
      {children}
    </Link>
  );
}

type NavLinkProps = {
  href: string;
  children: ReactNode;
  onClick?: () => void;
};

function NavLink({ href, children, onClick }: NavLinkProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="transition-opacity"
      style={{
        ...typography.navigation.desktop,
        color: hovered ? colors.text.primary : colors.text.secondary,
        transition: motions.hover.nav,
      }}
    >
      {children}
    </Link>
  );
}

function FiscalLogo() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5"
      style={{ textDecoration: "none" }}
    >
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center"
        style={{
          borderRadius: radius.md,
          backgroundImage: gradients.button.primary,
          boxShadow: shadows.button.primary,
          color: colors.text.inverse,
          ...typography.caption.desktop,
          fontWeight: typography.fontWeight.medium,
        }}
      >
        F
      </span>
      <span
        style={{
          fontFamily: typography.fontFamily.display,
          fontSize: typography.fontSize.xl,
          lineHeight: typography.lineHeight.title,
          letterSpacing: typography.letterSpacing.title,
          fontWeight: typography.fontWeight.regular,
          color: colors.text.primary,
        }}
      >
        Fiscal AI
      </span>
    </Link>
  );
}

function PublicNavbar({
  scrolled,
  mobileOpen,
  onToggleMobile,
  onCloseMobile,
}: {
  scrolled: boolean;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  onCloseMobile: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-50"
      style={{
        transition: motions.hover.nav,
      }}
    >
      <div
        className="mx-auto flex w-full items-center justify-between"
        style={{
          maxWidth: spacing.container.max,
          paddingInline: GUTTER,
          paddingBlock: spacing.scale[4],
          backgroundColor: scrolled
            ? "rgba(251, 248, 243, 0.82)"
            : "transparent",
          backdropFilter: scrolled ? "blur(20px) saturate(1.2)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(20px) saturate(1.2)" : "none",
          borderBottom: scrolled
            ? `1px solid ${colors.border.subtle}`
            : "1px solid transparent",
          boxShadow: scrolled ? shadows.card.default : shadows.none,
          transition: motions.modal.overlay,
        }}
      >
        <FiscalLogo />

        <nav
          aria-label="Navigation principale"
          className="hidden items-center lg:flex"
          style={{ gap: spacing.scale[8] }}
        >
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div
          className="hidden items-center lg:flex"
          style={{ gap: spacing.scale[6] }}
        >
          <NavLink href="/connexion">Connexion</NavLink>
          <PrimaryCta href="/essayer">Essayer gratuitement</PrimaryCta>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={mobileOpen}
          onClick={onToggleMobile}
          className="inline-flex h-10 w-10 items-center justify-center lg:hidden"
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.default}`,
            backgroundColor: colors.surface.primary,
            color: colors.text.primary,
            transition: motions.hover.icon,
          }}
        >
          <span className="sr-only">
            {mobileOpen ? "Fermer" : "Menu"}
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden
          >
            {mobileOpen ? (
              <path
                d="M4 4L14 14M14 4L4 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M3 5H15M3 9H15M3 13H15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen ? (
        <div
          className="lg:hidden"
          style={{
            borderBottom: `1px solid ${colors.border.subtle}`,
            backgroundColor: "rgba(251, 248, 243, 0.94)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: shadows.card.default,
            transition: motions.modal.popover,
          }}
        >
          <nav
            aria-label="Navigation mobile"
            className="mx-auto flex flex-col"
            style={{
              maxWidth: spacing.container.max,
              paddingInline: GUTTER,
              paddingBlock: spacing.scale[6],
              gap: spacing.scale[5],
            }}
          >
            {NAV_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} onClick={onCloseMobile}>
                {link.label}
              </NavLink>
            ))}
            <NavLink href="/connexion" onClick={onCloseMobile}>
              Connexion
            </NavLink>
            <PrimaryCta href="/essayer" onClick={onCloseMobile}>
              Essayer gratuitement
            </PrimaryCta>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function PublicFooter() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${colors.border.subtle}`,
        backgroundColor: "rgba(251, 248, 243, 0.58)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: spacing.container.max,
          paddingInline: GUTTER,
          paddingTop: spacing.scale[20],
          paddingBottom: spacing.scale[10],
        }}
      >
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12"
          style={{ gap: spacing.scale[12] }}
        >
          <div className="lg:col-span-5">
            <FiscalLogo />
            <p
              className="max-w-sm"
              style={{
                ...typography.body.desktop,
                color: colors.text.tertiary,
                marginTop: spacing.scale[5],
              }}
            >
              La déclaration LMNP, guidée par l&apos;intelligence. Un
              accompagnement premium, clair et rassurant.
            </p>
          </div>

          <FooterColumn title="Produit" links={FOOTER_LINKS.product} />
          <FooterColumn title="Entreprise" links={FOOTER_LINKS.company} />
          <FooterColumn title="Légal" links={FOOTER_LINKS.legal} />
        </div>

        <div
          className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
          style={{
            marginTop: spacing.scale[16],
            paddingTop: spacing.scale[8],
            borderTop: `1px solid ${colors.border.subtle}`,
          }}
        >
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            © {new Date().getFullYear()} Fiscal AI. Tous droits réservés.
          </p>
          <p style={{ ...typography.caption.desktop, color: colors.text.muted }}>
            Conçu en France · LMNP simplifié
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}) {
  return (
    <div className="lg:col-span-2">
      <p
        style={{
          ...typography.caption.desktop,
          color: colors.text.muted,
          letterSpacing: typography.letterSpacing.caps,
          textTransform: "uppercase",
          marginBottom: spacing.scale[4],
        }}
      >
        {title}
      </p>
      <ul className="flex flex-col" style={{ gap: spacing.scale[3] }}>
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              style={{
                ...typography.navigation.desktop,
                color: colors.text.secondary,
                transition: motions.hover.nav,
              }}
              className="hover:opacity-80"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div
      className="relative min-h-screen"
      style={{
        backgroundColor: colors.background.creamWarm,
        backgroundImage: gradients.landing.hero,
        backgroundAttachment: "fixed",
        backgroundSize: "cover",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: gradients.landing.atmosphere,
          opacity: 0.95,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: gradients.landing.glowLeft,
          opacity: 0.85,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: gradients.landing.glowRight,
          opacity: 0.9,
        }}
      />

      <div className="relative flex min-h-screen flex-col">
        <PublicNavbar
          scrolled={scrolled}
          mobileOpen={mobileOpen}
          onToggleMobile={() => setMobileOpen((open) => !open)}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <main
          className="mx-auto w-full flex-1"
          style={{
            maxWidth: spacing.container.max,
            paddingInline: GUTTER,
            paddingTop: spacing.section.pageTop,
            paddingBottom: spacing.section.pageBottom,
            transition: motions.page.enter,
          }}
        >
          {children}
        </main>

        <PublicFooter />
      </div>
    </div>
  );
}

export default PublicLayout;
