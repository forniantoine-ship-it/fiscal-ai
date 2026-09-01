/**
 * Fiscal AI — Official Motion System
 *
 * Apple × Linear inspired. Subtle, premium, calm —
 * invisible intelligence. Never flashy, never gimmicky.
 *
 * All transition and animation values are CSS-ready strings.
 * Keyframes use the `fiscal-` prefix for global registration.
 */
export const motions = {
  // ─── Durations ─────────────────────────────────────────────────────────────

  duration: {
    /** Instant — reduced motion fallback, state toggles */
    instant: "0ms",
    /** Micro feedback — focus rings, opacity ticks */
    fast: "120ms",
    /** Default UI — hovers, buttons, inputs */
    normal: "200ms",
    /** Cards, dropdowns, workflow panels */
    moderate: "280ms",
    /** Modals, drawers entering */
    slow: "350ms",
    /** Page transitions, deliberate reveals */
    deliberate: "450ms",
    /** Success confirmations, completion states */
    extended: "600ms",
    /** AI analyzing pulse / shimmer cycle */
    cycle: "1800ms",
  },

  // ─── Easing — no bounce, no elastic, no overshoot ─────────────────────────

  easing: {
    /** Default deceleration — most exits and hovers */
    default: "cubic-bezier(0.4, 0, 0.2, 1)",
    /** Smooth out — Apple-like settle */
    out: "cubic-bezier(0.22, 1, 0.36, 1)",
    /** Gentle in — elements leaving */
    in: "cubic-bezier(0.4, 0, 1, 1)",
    /** Calm symmetric — opacity crossfades */
    inOut: "cubic-bezier(0.45, 0, 0.55, 1)",
    /** Content entering view — soft deceleration */
    enter: "cubic-bezier(0.16, 1, 0.3, 1)",
    /** Content leaving view — quiet acceleration */
    exit: "cubic-bezier(0.4, 0, 0.6, 1)",
    /** Progress bars, upload meters — steady and honest */
    linear: "linear",
  },

  // ─── Hover transitions ─────────────────────────────────────────────────────

  hover: {
    /** Default interactive element */
    default:
      "background-color 200ms cubic-bezier(0.4, 0, 0.2, 1), color 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1)",

    /** Card lift — shadow only, no aggressive translate */
    card: "box-shadow 280ms cubic-bezier(0.22, 1, 0.36, 1), border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)",

    /** Primary button — background depth shift */
    button:
      "background 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms cubic-bezier(0.4, 0, 0.2, 1)",

    /** Ghost / text button */
    ghost:
      "background-color 200ms cubic-bezier(0.4, 0, 0.2, 1), color 200ms cubic-bezier(0.4, 0, 0.2, 1)",

    /** Navigation item */
    nav: "color 200ms cubic-bezier(0.4, 0, 0.2, 1), background-color 200ms cubic-bezier(0.4, 0, 0.2, 1)",

    /** Icon button — opacity and background */
    icon: "background-color 120ms cubic-bezier(0.4, 0, 0.2, 1), opacity 120ms cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // ─── Upload animations ─────────────────────────────────────────────────────

  upload: {
    /** Drop zone state change — border and background */
    state:
      "background-color 280ms cubic-bezier(0.45, 0, 0.55, 1), border-color 280ms cubic-bezier(0.45, 0, 0.55, 1), box-shadow 280ms cubic-bezier(0.22, 1, 0.36, 1)",

    /** Drag-over receptive glow */
    dragOver:
      "box-shadow 350ms cubic-bezier(0.22, 1, 0.36, 1), border-color 280ms cubic-bezier(0.45, 0, 0.55, 1)",

    /** Progress bar fill */
    progress: "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",

    /** File item appearing in list */
    itemEnter:
      "opacity 280ms cubic-bezier(0.16, 1, 0.3, 1), transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",

    /** Upload complete crossfade */
    complete: "opacity 350ms cubic-bezier(0.45, 0, 0.55, 1)",
  },

  // ─── AI analyzing states ───────────────────────────────────────────────────

  analyzing: {
    /** Gentle opacity breathe — invisible intelligence */
    pulse:
      "fiscal-analyzing-pulse 1800ms cubic-bezier(0.45, 0, 0.55, 1) infinite",

    /** Soft shimmer across progress surface */
    shimmer:
      "fiscal-analyzing-shimmer 2400ms cubic-bezier(0.45, 0, 0.55, 1) infinite",

    /** Status text crossfade */
    status: "opacity 280ms cubic-bezier(0.45, 0, 0.55, 1)",

    /** Progress indicator fill */
    progress: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)",

    /** Thinking dots — staggered opacity */
    dots: "fiscal-analyzing-dots 1200ms cubic-bezier(0.45, 0, 0.55, 1) infinite",
  },

  // ─── Page transitions ──────────────────────────────────────────────────────

  page: {
    /** Enter — fade with subtle upward settle */
    enter:
      "opacity 450ms cubic-bezier(0.16, 1, 0.3, 1), transform 450ms cubic-bezier(0.16, 1, 0.3, 1)",

    /** Exit — faster, quieter departure */
    exit:
      "opacity 280ms cubic-bezier(0.4, 0, 0.6, 1), transform 280ms cubic-bezier(0.4, 0, 0.6, 1)",

    /** Initial enter state — apply before transition */
    enterFrom: "opacity: 0; transform: translateY(8px)",
    /** Final enter state */
    enterTo: "opacity: 1; transform: translateY(0)",

    /** Content section stagger delay step */
    staggerDelay: "60ms",
  },

  // ─── Workflow progression ──────────────────────────────────────────────────

  workflow: {
    /** Step content swap */
    content:
      "opacity 280ms cubic-bezier(0.45, 0, 0.55, 1), transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",

    /** Step indicator state change */
    step:
      "background-color 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms cubic-bezier(0.4, 0, 0.2, 1), color 200ms cubic-bezier(0.4, 0, 0.2, 1)",

    /** Progress bar advance */
    progress: "width 400ms cubic-bezier(0.22, 1, 0.36, 1)",

    /** Step completion check reveal */
    complete:
      "opacity 280ms cubic-bezier(0.16, 1, 0.3, 1), transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",

    /** Sidebar active indicator slide */
    indicator:
      "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // ─── Modal transitions ─────────────────────────────────────────────────────

  modal: {
    /** Backdrop scrim fade */
    overlay: "opacity 250ms cubic-bezier(0.45, 0, 0.55, 1)",

    /** Dialog enter — subtle scale and fade (Apple-like) */
    enter:
      "opacity 350ms cubic-bezier(0.16, 1, 0.3, 1), transform 350ms cubic-bezier(0.16, 1, 0.3, 1)",

    /** Dialog exit — quicker dismiss */
    exit:
      "opacity 200ms cubic-bezier(0.4, 0, 0.6, 1), transform 200ms cubic-bezier(0.4, 0, 0.6, 1)",

    /** Initial enter — barely perceptible scale */
    enterFrom: "opacity: 0; transform: scale(0.98)",
    /** Final enter */
    enterTo: "opacity: 1; transform: scale(1)",

    /** Dropdown / popover — lighter than modal */
    popover:
      "opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
  },

  // ─── Success states ────────────────────────────────────────────────────────

  success: {
    /** Confirmation block fade in */
    reveal:
      "opacity 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",

    /** Checkmark icon — quiet scale settle */
    icon:
      "opacity 350ms cubic-bezier(0.16, 1, 0.3, 1), transform 350ms cubic-bezier(0.16, 1, 0.3, 1)",

    /** Success banner dismiss */
    dismiss:
      "opacity 280ms cubic-bezier(0.4, 0, 0.6, 1), transform 280ms cubic-bezier(0.4, 0, 0.6, 1)",

    /** Background tint wash */
    surface:
      "background-color 400ms cubic-bezier(0.45, 0, 0.55, 1), border-color 400ms cubic-bezier(0.45, 0, 0.55, 1)",
  },

  // ─── Keyframes — register in global CSS ────────────────────────────────────

  keyframes: {
    analyzingPulse: `@keyframes fiscal-analyzing-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.72; }
}`,

    analyzingShimmer: `@keyframes fiscal-analyzing-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}`,

    analyzingDots: `@keyframes fiscal-analyzing-dots {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}`,

    fadeIn: `@keyframes fiscal-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}`,

    fadeOut: `@keyframes fiscal-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}`,

    slideUp: `@keyframes fiscal-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}`,

    scaleIn: `@keyframes fiscal-scale-in {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}`,

    successReveal: `@keyframes fiscal-success-reveal {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}`,
  },

  // ─── Reduced motion ────────────────────────────────────────────────────────

  reducedMotion: {
    /** Replace all transitions when prefers-reduced-motion is active */
    transition: "none",
    /** Replace all animations */
    animation: "none",
  },
} as const;

export type Motions = typeof motions;
