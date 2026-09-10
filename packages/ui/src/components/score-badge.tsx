import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../cn.js";

/**
 * Score 0-5 display primitives. The plan's rule: score colors never
 * carry meaning alone — the numeric value is always rendered alongside
 * the hue, so the ramp is colorblind-safe by construction.
 */
const scoreBadgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums",
  {
    variants: {
      level: {
        0: "border-[var(--color-score-0)] text-[var(--color-score-0)]",
        1: "border-[var(--color-score-1)] text-[var(--color-score-1)]",
        2: "border-[var(--color-score-2)] text-[var(--color-score-2)]",
        3: "border-[var(--color-score-3)] text-[var(--color-score-3)]",
        4: "border-[var(--color-score-4)] text-[var(--color-score-4)]",
        5: "border-[var(--color-score-5)] text-[var(--color-score-5)]",
      },
    },
  },
);

export type ScoreLevel = NonNullable<VariantProps<typeof scoreBadgeVariants>["level"]>;

export interface ScoreBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Score 0-5 (integers; halves clamp to nearest level). */
  score: number;
  /** Accessible description of what the score means, e.g. the criterion title. */
  label: string;
}

export const ScoreBadge = React.forwardRef<HTMLSpanElement, ScoreBadgeProps>(
  ({ score, label, className, ...props }, ref) => {
    const level = Math.min(5, Math.max(0, Math.round(score))) as ScoreLevel;
    return (
      <span
        ref={ref}
        className={cn(scoreBadgeVariants({ level }), className)}
        role="img"
        aria-label={`${label}: score ${level} of 5`}
        {...props}
      >
        {level}
        <span className="text-[0.65em] font-normal opacity-60">/5</span>
      </span>
    );
  },
);
ScoreBadge.displayName = "ScoreBadge";

/** Compact overall-score pill, 0-100 with a score-ramp tinted background. */
export const OverallScore = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { score: number; label: string }
>(({ score, label, className, ...props }, ref) => {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const level = Math.min(5, Math.max(0, Math.round(clamped / 20))) as ScoreLevel;
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-[var(--radius-control)] px-2 py-1 font-mono text-sm font-bold tabular-nums",
        "bg-[var(--color-surface-sunken)]",
        `text-[var(--color-score-${level})]`,
        className,
      )}
      role="img"
      aria-label={`${label}: overall score ${clamped} of 100`}
      {...props}
    >
      {clamped}
      <span className="text-[0.65em] font-normal opacity-60">/100</span>
    </span>
  );
});
OverallScore.displayName = "OverallScore";
