"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth-form";
import { useSession } from "@/lib/auth-client";

export default function LandingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && session) router.replace("/jobs");
  }, [isPending, session, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">HireLens</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-muted)" }}>
          RAG + LLM resume screening with per-criterion evidence you can verify.
        </p>
      </header>
      {!isPending && !session && <AuthForm />}
    </main>
  );
}
