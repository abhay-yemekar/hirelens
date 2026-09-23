"use client";

import { Button, CardContent } from "@hirelens/ui";
import { ChevronDown, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { trackEvent } from "@/lib/analytics";
import { deriveRubric, importRubric, type RubricVersion } from "@/lib/api";
import { presetToRubric, RUBRIC_LIBRARY } from "./rubric-library";

/** The demo rubric imported by "Use demo rubric" (valid RubricSchema shape). */
export function demoRubric() {
  const levels = [0, 1, 2, 3, 4, 5].map((n) => ({
    label: String(n),
    description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
  }));
  return {
    version: 1,
    key: "backend-eng",
    title: "Backend Engineer",
    criteria: ["system-design", "databases", "testing", "ops", "communication"].map((key) => ({
      key,
      title: key,
      weight: 1,
      scale: levels,
      doNotUse: [],
    })),
    exclusions: [],
  };
}

/** One editable criterion row. */
interface EditableCriterion {
  key: string;
  title: string;
  weight: number;
}

const MIN_CRITERIA = 5;
const MAX_CRITERIA = 8;

/** "senior backend" → "senior-backend" (stable key for scores). */
function slugify(title: string, fallback: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : fallback;
}

/** Meaningful generic anchored scale for a criterion (0–5). */
function defaultScale(title: string) {
  const t = title.trim().toLowerCase() || "this criterion";
  return [
    { label: "0 — None", description: `No evidence of ${t} in the resume.` },
    { label: "1 — Faint", description: `Barely mentions anything related to ${t}.` },
    {
      label: "2 — Some",
      description: `Some exposure to ${t}: coursework, brief use, or a single project.`,
    },
    { label: "3 — Solid", description: `Clear working experience with ${t}.` },
    {
      label: "4 — Strong",
      description: `Substantial, repeated experience; led work involving ${t}.`,
    },
    { label: "5 — Expert", description: `Deep expertise with measurable impact in ${t}.` },
  ];
}

/** Assemble the full rubric JSON the API validates against RubricSchema. */
function buildRubricPayload(title: string, criteria: EditableCriterion[]) {
  return {
    version: 1,
    key: slugify(title, "custom-rubric"),
    title: title.trim() || "Screening rubric",
    criteria: criteria.map((c) => ({
      key: slugify(c.title, c.key || "criterion"),
      title: c.title.trim(),
      weight: Math.max(0, Number(c.weight) || 0),
      scale: defaultScale(c.title),
      doNotUse: [],
    })),
    exclusions: [],
  };
}

/** Normalize the stored rubric payload into editable rows. */
function toEditable(payload: Record<string, unknown> | undefined): {
  title: string;
  criteria: EditableCriterion[];
} | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as {
    title?: unknown;
    criteria?: unknown;
  };
  if (!Array.isArray(raw.criteria) || raw.criteria.length === 0) return null;
  const criteria: EditableCriterion[] = [];
  for (const c of raw.criteria) {
    if (!c || typeof c !== "object") continue;
    const cc = c as { key?: unknown; title?: unknown; weight?: unknown };
    if (typeof cc.title !== "string") continue;
    criteria.push({
      key: typeof cc.key === "string" ? cc.key : slugify(cc.title, "criterion"),
      title: cc.title,
      weight: typeof cc.weight === "number" && cc.weight > 0 ? cc.weight : 1,
    });
  }
  if (criteria.length === 0) return null;
  return { title: typeof raw.title === "string" ? raw.title : "Screening rubric", criteria };
}

/**
 * Rubric editor: titles + weights for 5–8 criteria, saved as a new rubric
 * version. Scale descriptions and do-not-use bars get sensible defaults
 * (recruiters tune what matters — the anchored wording is provided);
 * power users can paste full rubric JSON in the JSON tab.
 */
export function RubricEditor({
  jobId,
  rubrics,
  onSaved,
}: {
  jobId: string;
  rubrics: RubricVersion[];
  onSaved: () => Promise<void> | void;
}) {
  // The API returns versions newest-first; index 0 is the active one.
  const latest = rubrics.length > 0 ? rubrics[0] : null;
  const [tab, setTab] = useState<"form" | "json">("form");
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState<EditableCriterion[]>([]);
  const [jsonText, setJsonText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadedFrom, setLoadedFrom] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Seed the editor from the active version once rubrics arrive.
  useEffect(() => {
    const editable = toEditable(latest?.payload);
    if (editable && loadedFrom === null) {
      setTitle(editable.title);
      setCriteria(editable.criteria);
      setLoadedFrom(latest?.version ?? null);
      setJsonText(JSON.stringify(latest?.payload ?? {}, null, 2));
    }
  }, [latest, loadedFrom]);

  const totalWeight = useMemo(
    () => criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0),
    [criteria],
  );
  const countOk = criteria.length >= MIN_CRITERIA && criteria.length <= MAX_CRITERIA;

  function updateCriterion(i: number, patch: Partial<EditableCriterion>) {
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await importRubric(jobId, buildRubricPayload(title, criteria));
      trackEvent("rubric.edited", { jobId });
      await onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function saveJson() {
    setBusy("json");
    setError(null);
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      await importRubric(jobId, parsed);
      trackEvent("rubric.imported_json", { jobId });
      await onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function draftWithAi() {
    setBusy("derive");
    setError(null);
    try {
      await deriveRubric(jobId);
      trackEvent("rubric.derived", { jobId });
      await onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const inputStyle = {
    borderColor: "var(--hl-border)",
    background: "var(--hl-input)",
  } as const;

  return (
    <CardContent className="flex flex-col gap-4">
      {/* Version pills: the active version + audit-trail history. */}
      {rubrics.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {rubrics.map((r, i) => {
            const active = i === 0; // newest-first from the API
            return (
              <span
                key={r.id}
                className="rounded-full px-3 py-1 text-sm"
                title={
                  active
                    ? `Version ${r.version} — the one scoring uses right now`
                    : `Version ${r.version} — kept for the audit trail; only the newest version is used`
                }
                style={
                  active
                    ? { background: "var(--hl-accent)", color: "var(--hl-ink)", fontWeight: 600 }
                    : {
                        background: "transparent",
                        color: "var(--hl-muted)",
                        border: "1px solid var(--hl-border)",
                      }
                }
              >
                v{r.version}
                {active ? " · active" : ""}
              </span>
            );
          })}
          <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
            Scoring always uses the newest version — older ones stay for the audit trail.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Rubric editor mode"
          className="flex rounded-[var(--radius-control)] border p-0.5"
          style={{ borderColor: "var(--hl-border)" }}
        >
          {(["form", "json"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              type="button"
              onClick={() => setTab(t)}
              className="rounded-[calc(var(--radius-control)-2px)] px-3 py-1 text-xs font-medium transition-colors"
              style={
                tab === t
                  ? { background: "var(--hl-accent)", color: "var(--hl-ink)" }
                  : { color: "var(--hl-mist)" }
              }
            >
              {t === "form" ? "Criteria" : "JSON"}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
          {tab === "form"
            ? `${criteria.length} criteria · weights are relative (auto-normalized)`
            : "Paste full rubric JSON — validated against the rubric schema"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              aria-expanded={libraryOpen}
              aria-haspopup="listbox"
              onClick={() => setLibraryOpen((v) => !v)}
              title="Import a curated rubric for a common role — then tune it"
            >
              <ChevronDown aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              Rubric library
            </Button>
            {libraryOpen ? (
              <div
                role="listbox"
                aria-label="Rubric library presets"
                className="absolute right-0 z-20 mt-2 w-80 rounded-[var(--radius-card)] border p-1 shadow-xl"
                style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
              >
                {RUBRIC_LIBRARY.map((preset) => (
                  <button
                    key={preset.key}
                    role="option"
                    aria-selected={false}
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void (async () => {
                        setBusy(preset.key);
                        setError(null);
                        try {
                          await importRubric(jobId, presetToRubric(preset));
                          trackEvent("rubric.library_imported", {
                            jobId,
                            preset: preset.key,
                          });
                          setLibraryOpen(false);
                          await onSaved();
                        } catch (err) {
                          setError(err);
                        } finally {
                          setBusy(null);
                        }
                      })()
                    }
                    className="block w-full rounded-[calc(var(--radius-card)-2px)] px-3 py-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    <span
                      className="block text-sm font-medium"
                      style={{ color: "var(--hl-cream)" }}
                    >
                      {preset.title}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--hl-mist)" }}>
                      {preset.blurb}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            title="Loads a sample scorecard so you can try scoring without waiting for AI rubric drafting"
            onClick={() =>
              void (async () => {
                setBusy("demo");
                setError(null);
                try {
                  await importRubric(jobId, demoRubric());
                  await onSaved();
                } catch (err) {
                  setError(err);
                } finally {
                  setBusy(null);
                }
              })()
            }
          >
            {busy === "demo" ? "Importing…" : "Use demo rubric"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={draftWithAi}
            title="Draft a rubric from the job description with the AI — saved as a new version you can tune. Needs the server's LLM key."
          >
            <Sparkles aria-hidden className="mr-1.5 h-3.5 w-3.5" />
            {busy === "derive" ? "Drafting…" : "Draft with AI"}
          </Button>
        </div>
      </div>

      {error ? <NoticeBanner error={error} /> : null}

      {tab === "form" ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: "var(--hl-mist)" }}>
              Rubric title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Backend Engineer"
              className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none"
              style={inputStyle}
            />
          </label>

          <div
            className="flex items-center gap-2 px-1 text-xs font-medium"
            style={{ color: "var(--hl-muted)" }}
          >
            <span className="flex-1">Criterion — what the AI grades (5 to 8 required)</span>
            <span className="w-16 text-center">Weight</span>
            <span className="w-8" aria-hidden />
          </div>

          {criteria.map((c, i) => (
            <div key={`${c.key}-${i}`} className="flex items-center gap-2">
              <input
                value={c.title}
                onChange={(e) => updateCriterion(i, { title: e.target.value })}
                maxLength={80}
                placeholder={`Criterion ${i + 1}`}
                aria-label={`Criterion ${i + 1} title`}
                className="min-w-0 flex-1 rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none"
                style={inputStyle}
              />
              <input
                type="number"
                min={0}
                step={0.5}
                value={c.weight}
                onChange={(e) => updateCriterion(i, { weight: Number(e.target.value) })}
                aria-label={`Weight for ${c.title || `criterion ${i + 1}`}`}
                title="Relative importance — higher weighs more in the overall score"
                className="w-16 rounded-[var(--radius-control)] border px-2 py-2 text-center text-sm tabular-nums text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none"
                style={inputStyle}
              />
              <button
                type="button"
                aria-label={`Remove ${c.title || `criterion ${i + 1}`}`}
                title="Remove this criterion"
                disabled={criteria.length <= MIN_CRITERIA}
                onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-md border transition-colors hover:bg-white/[0.06] disabled:opacity-30"
                style={{ borderColor: "var(--hl-border)", color: "var(--hl-bad)" }}
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={criteria.length >= MAX_CRITERIA}
              onClick={() =>
                setCriteria((cs) => [...cs, { key: `c${cs.length + 1}`, title: "", weight: 1 }])
              }
            >
              <Plus aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              Add criterion
            </Button>
            <span
              className="text-xs"
              style={{
                color: totalWeight > 0 && countOk ? "var(--hl-muted)" : "var(--color-warning)",
              }}
            >
              {!countOk
                ? `Needs ${MIN_CRITERIA}–${MAX_CRITERIA} criteria (currently ${criteria.length})`
                : totalWeight <= 0
                  ? "Weights must sum to more than 0"
                  : `Total weight ${Math.round(totalWeight * 10) / 10}`}
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={busy !== null || !countOk || totalWeight <= 0}
              onClick={save}
            >
              <Save aria-hidden className="mr-1.5 h-3.5 w-3.5" />
              {busy === "save" ? "Saving…" : "Save as new version"}
            </Button>
          </div>
          <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
            Saving creates version {(latest?.version ?? 0) + 1} — the one scoring will use. Each
            criterion is graded 0–5 with the anchored scale provided automatically; the overall
            score is the weighted average.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={14}
            spellCheck={false}
            aria-label="Rubric JSON"
            className="rounded-[var(--radius-control)] border px-3 py-2 font-mono text-xs text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none"
            style={inputStyle}
          />
          <Button
            size="sm"
            className="self-start"
            disabled={busy !== null || jsonText.trim().length === 0}
            onClick={saveJson}
          >
            {busy === "json" ? "Validating…" : "Validate & save as new version"}
          </Button>
        </div>
      )}
    </CardContent>
  );
}
