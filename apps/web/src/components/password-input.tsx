"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

/**
 * A password input with a show/hide button inside its right edge. The
 * button is a real button, so keyboard and screen-reader users reach it,
 * and it never submits the form. Pair it with `<label htmlFor>`: a button
 * may not sit inside a label.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`w-full pr-10 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[var(--radius-control)] text-[var(--hl-muted)] transition-colors hover:text-[var(--hl-cream)] focus-visible:text-[var(--hl-cream)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hl-accent-soft)]"
      >
        {visible ? (
          <EyeOff aria-hidden className="h-4 w-4" />
        ) : (
          <Eye aria-hidden className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
