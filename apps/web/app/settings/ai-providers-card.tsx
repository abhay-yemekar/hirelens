"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { ApiRequestError, apiFetch } from "@/lib/api";

interface ProviderEntry {
  id: string;
  label: string;
  model: string;
}

interface ProbeResult {
  id: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

interface LlmSettings {
  setting: { llmProvider: string | null; fallbackOrder: string[] };
  configured: ProviderEntry[];
  providerLabels: Record<string, string>;
}

/**
 * AI provider settings: show which providers the server has credentials
 * for (ids only — keys never appear here), live-test each one, and let
 * owners pick the org's default provider. The selection overlaps with —
 * but never replaces — the server-side env fallback chain.
 */
export function LlmProvidersCard() {
  const [data, setData] = useState<LlmSettings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, ProbeResult> | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [savedNote, setSavedNote] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<LlmSettings & { ok: true }>("/api/settings/llm");
      setData(res);
      setSelected(res.setting.llmProvider);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pick(providerId: string | null) {
    if (!data) return;
    setSaving(providerId === selected ? selected : providerId);
    setError(null);
    setSavedNote(false);
    try {
      await apiFetch("/api/settings/llm", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ llmProvider: providerId }),
      });
      setSelected(providerId);
      setSavedNote(true);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(null);
    }
  }

  async function testAll() {
    if (!data || data.configured.length === 0) return;
    setTesting(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: true; results: ProbeResult[] }>("/api/settings/llm/test", {
        method: "POST",
      });
      const byId: Record<string, ProbeResult> = {};
      for (const r of res.results) byId[r.id] = r;
      setProbes(byId);
    } catch (err) {
      setError(err);
    } finally {
      setTesting(false);
    }
  }

  const message = (err: unknown): string =>
    err instanceof ApiRequestError ? err.message || err.code : "Something went wrong.";

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle style={{ color: "var(--hl-cream)" }}>AI providers</CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>
          Which AI provider grades this org's resumes. If one is overloaded or rate-limited, the
          server automatically tries the fallbacks configured by the operator (in env order). API
          keys stay server-side — this card never shows them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <NoticeBanner error={error} /> : null}

        {!data ? (
          <p className="text-sm" style={{ color: "var(--hl-muted)" }}>
            Loading…
          </p>
        ) : data.configured.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--hl-muted)" }}>
            No AI providers are configured on this server. Self-hosters: set HIRELENS_LLM_PROVIDER,
            HIRELENS_LLM_MODEL and HIRELENS_LLM_API_KEY — see the self-hosting guide.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {data.configured.map((p) => {
                const active = selected === p.id;
                const probe = probes?.[p.id];
                const busy = saving === p.id;
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3"
                    style={{
                      borderColor: active ? "var(--hl-accent)" : "var(--hl-border)",
                      background: active
                        ? "color-mix(in oklab, var(--hl-accent) 8%, transparent)"
                        : "transparent",
                    }}
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="radio"
                        name="llm-provider"
                        checked={active}
                        onChange={() => void pick(p.id)}
                        className="accent-[var(--hl-accent)]"
                        aria-label={`Use ${p.label} as the default provider`}
                      />
                      <span className="min-w-0">
                        <span
                          className="block text-sm font-medium"
                          style={{ color: "var(--hl-cream)" }}
                        >
                          {data.providerLabels[p.id] ?? p.label}
                        </span>
                        <span
                          className="block truncate text-xs"
                          style={{ color: "var(--hl-muted)" }}
                        >
                          model: {p.model}
                        </span>
                      </span>
                    </label>
                    <span className="flex items-center gap-2">
                      {busy && (
                        <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
                          Saving…
                        </span>
                      )}
                      {probe && (
                        <span
                          className="flex items-center gap-1 text-xs"
                          style={{
                            color: probe.ok ? "var(--color-success)" : "var(--color-danger)",
                          }}
                          title={probe.error ?? `Pong in ${probe.latencyMs} ms`}
                        >
                          {probe.ok ? (
                            <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle aria-hidden className="h-3.5 w-3.5" />
                          )}
                          {probe.ok ? `${probe.latencyMs} ms` : "failed"}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" disabled={testing} onClick={() => void testAll()}>
                <RefreshCw
                  aria-hidden
                  className={`mr-1.5 h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`}
                />
                {testing ? "Testing…" : "Test all providers"}
              </Button>
              <Button
                size="sm"
                disabled={saving !== null || selected === null}
                variant="ghost"
                onClick={() => void pick(null)}
              >
                Use server default
              </Button>
              {savedNote && (
                <span className="text-sm" style={{ color: "var(--color-success)" }}>
                  ✓ Saved
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
              Errors picking a provider? The server may lack a key for it — the
              "provider_not_configured" message names which. Fallbacks for busy moments come from
              the server's HIRELENS_LLM_FALLBACKS setting; ask your operator to add more.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
