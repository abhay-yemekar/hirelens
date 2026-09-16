"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth-form";
import { LogoMark } from "@/components/brand";
import { useSession } from "@/lib/auth-client";

const PROOF = [
  {
    title: "Evidence-linked scores",
    text: "Every point quotes the exact resume text that produced it — at its character offset.",
  },
  {
    title: "Tamper-evident audit trail",
    text: "Every decision and override is appended to a hash chain. Tampering breaks it visibly.",
  },
  {
    title: "Built-in bias auditing",
    text: "One click computes selection rates per group and applies the EEOC four-fifths rule.",
  },
];

/**
 * Split-panel sign-in: brand proof on the left, form on the right.
 * The form itself is AuthForm (email + social providers). Already-
 * signed-in visitors are redirected to their jobs.
 */
export function SignInPanel() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && session) router.replace("/jobs");
  }, [isPending, session, router]);

  return (
    <main className="relative flex min-h-screen">
      {/* Brand panel */}
      <section
        className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: "var(--hl-ink-2)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(640px 420px at 20% 0%, rgba(255,107,87,0.14), transparent 65%), radial-gradient(520px 360px at 85% 100%, rgba(120,140,255,0.08), transparent 60%)",
          }}
        />
        <Link href="/" className="relative text-[var(--hl-cream)]">
          <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LogoMark size={26} />
            Hire<span style={{ color: "var(--hl-accent)" }}>Lens</span>
          </span>
        </Link>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--hl-cream)]">
            AI screening that shows <span style={{ color: "var(--hl-accent)" }}>its work.</span>
          </h1>
          <ul className="mt-8 flex flex-col gap-5">
            {PROOF.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
                  style={{ background: "var(--hl-accent)" }}
                />
                <div>
                  <p className="text-sm font-semibold text-[var(--hl-cream)]">{p.title}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-[var(--hl-mist)]">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-[var(--hl-muted)]">
          Open source · MIT · self-hostable — resumes never have to leave your machine.
        </p>
      </section>

      {/* Form panel */}
      <section className="relative flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            background:
              "radial-gradient(500px 280px at 50% -10%, rgba(255,107,87,0.10), transparent 70%)",
          }}
        />
        <div className="relative w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--hl-cream)]"
            >
              <LogoMark size={24} />
              Hire<span style={{ color: "var(--hl-accent)" }}>Lens</span>
            </Link>
          </div>
          <AuthForm />
          <p className="mt-6 text-center text-sm">
            <Link
              href="/"
              className="transition-colors hover:text-[var(--hl-cream)]"
              style={{ color: "var(--hl-mist)" }}
            >
              ← Back to home
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
