/**
 * HireLens brand: a lens aperture over a document — "glass-box screening".
 * Pure SVG so it stays crisp everywhere; inherits currentColor.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M16 7.5 L21.5 16 L16 24.5 L10.5 16 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="2.6" fill="currentColor" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={compact ? 24 : 28} />
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">
          Hire<span style={{ color: "var(--hl-accent)" }}>Lens</span>
        </span>
      )}
    </span>
  );
}
