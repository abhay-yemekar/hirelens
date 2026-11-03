/**
 * Brand: the "highlight lens", a lens ring over lines of a resume with one
 * line highlighted in coral, the way every score highlights its evidence.
 * Pure SVG so it stays crisp everywhere; the ring and lines inherit
 * currentColor, the highlight is always coral. Sources and the rules for
 * small sizes and dark backgrounds are in docs/brand.
 */

/**
 * The product name for the wordmark and the link-preview image. Page copy
 * still names the product inline; the rename (#114) updates both.
 */
export const BRAND = {
  name: "HireLens",
  /** The wordmark's two halves; the second is set in coral. */
  lead: "Hire",
  accent: "Lens",
  tagline: "See why, not just who",
} as const;

export const BRAND_COLORS = {
  ink: "#0d1226",
  coral: "#ff6b57",
  cream: "#f7f3ea",
  mist: "#b6bdd4",
} as const;

export function LogoMark({ size = 28 }: { size?: number }) {
  // At 16 px and below the faint lines blur into the ring, so the small
  // variant drops them and thickens the ring and the highlight.
  if (size <= 16) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="12.4" stroke="currentColor" strokeWidth="3.4" />
        <rect x="7.6" y="12.6" width="16.8" height="6.8" rx="1.6" fill={BRAND_COLORS.coral} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="2.6" />
      <line
        x1="10.5"
        y1="10.6"
        x2="21.5"
        y2="10.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />
      <rect x="8.6" y="13.7" width="14.8" height="4.6" rx="1.2" fill={BRAND_COLORS.coral} />
      <line
        x1="10.5"
        y1="21.4"
        x2="18"
        y2="21.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={compact ? 24 : 28} />
      {!compact && (
        /* One text node: a flex gap between two spans is how "Hire Lens"
           once rendered with a stray space between the words. */
        <span className="text-lg font-semibold tracking-tight">
          {BRAND.lead}
          <span style={{ color: "var(--hl-accent)" }}>{BRAND.accent}</span>
        </span>
      )}
    </span>
  );
}
