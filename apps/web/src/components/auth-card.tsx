"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@candidlens/ui";
import type { ReactNode } from "react";

/**
 * Shared look for the sign-in pages (sign in, forgot password, reset
 * password): brand ink surface + warm border, with an accent glow on
 * focus.
 */
export const authInputClass =
  "w-full rounded-[var(--radius-control)] border px-3 py-2.5 text-sm text-[var(--hl-cream)] transition-shadow duration-[var(--duration-fast)] placeholder:text-[var(--hl-muted)] focus:outline-none focus:border-[var(--hl-accent)] focus:ring-2 focus:ring-[var(--hl-accent-soft)]";
export const authInputStyle = {
  borderColor: "var(--hl-border)",
  background: "var(--hl-input)",
} as const;
export const authSubmitClass =
  "h-11 bg-white text-[0.95rem] font-semibold text-[#0d1226] hover:bg-[#eef0fa]";
export const authLinkClass =
  "font-semibold text-[var(--hl-accent)] transition-opacity hover:opacity-85";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      className="w-full max-w-md"
      style={{
        background: "var(--hl-card)",
        borderColor: "rgba(183, 191, 218, 0.22)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 32px 80px -32px rgba(3, 6, 18, 0.9)",
      }}
    >
      <CardHeader>
        {/* h1: the page's top heading (axe heading-order). */}
        <CardTitle asChild className="text-xl" style={{ color: "var(--hl-cream)" }}>
          <h1>{title}</h1>
        </CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
