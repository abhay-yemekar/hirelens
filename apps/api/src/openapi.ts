/**
 * The public API contract, served at GET /api/openapi.json. Hand-authored
 * (no codegen dependency) and kept honest by an integration test that
 * asserts every mounted route appears in the document.
 */

const errorResponse = {
  description:
    "Error envelope. `code` is a stable machine-readable identifier (e.g. `unauthorized`, `forbidden`, `llm_not_configured`, `internal_error`).",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", description: "Human-readable message." },
          code: { type: "string", description: "Stable machine-readable code." },
        },
      },
    },
  },
} as const;

const job = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    organizationId: { type: "string", format: "uuid" },
    title: { type: "string" },
    description: { type: "string", description: "Full job description text (JD)." },
    status: { type: "string", enum: ["draft", "open", "closed"] },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const rubric = {
  type: "object",
  description:
    "Versioned scoring rubric: criteria with six anchored levels each, weights summing to 1. Forkable and importable JSON.",
  properties: {
    id: { type: "string", format: "uuid" },
    jobId: { type: "string", format: "uuid" },
    version: { type: "integer" },
    title: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          weight: { type: "number" },
          description: { type: "string" },
          levels: {
            type: "array",
            description: "Exactly six anchored levels, 0–5.",
            items: {
              type: "object",
              properties: {
                score: { type: "integer", minimum: 0, maximum: 5 },
                label: { type: "string" },
                anchor: { type: "string" },
              },
            },
          },
        },
      },
    },
    promptHash: { type: "string", description: "Hash of the derivation prompt, for audit." },
  },
} as const;

const candidate = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    jobId: { type: "string", format: "uuid" },
    displayName: { type: "string", description: "File label; never parsed from resume identity." },
    source: { type: "string", enum: ["upload", "zip"] },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const scoreRow = {
  type: "object",
  description: "Per-criterion score with quoted evidence located in the document text.",
  properties: {
    criterionKey: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 5 },
    rationale: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quotedText: { type: "string" },
          start: { type: "integer", description: "Char offset into the document text." },
          end: { type: "integer" },
        },
      },
    },
  },
} as const;

const jsonBody = (schema: object) => ({
  required: true,
  content: { "application/json": { schema } },
});

const ok = (schema: object, description = "Success.") => ({
  description,
  content: { "application/json": { schema } },
});

/** OpenAPI 3.1 document describing the entire authenticated surface. */
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "HireLens API",
    version: "0.1.0",
    description:
      "Glass-box AI resume screening: LLM scoring against versioned rubrics with evidence spans, hash-chained audit trail, and adverse-impact reporting. Every endpoint is organization-scoped; roles are owner > recruiter > hiring_manager > viewer. Authenticate via the cookie session issued by the better-auth endpoints under `/api/auth`.",
  },
  servers: [{ url: "/", description: "Current host" }],
  tags: [
    { name: "Auth" },
    { name: "Jobs" },
    { name: "Rubrics" },
    { name: "Candidates" },
    { name: "Scoring" },
    { name: "Review" },
    { name: "Bias audit" },
  ],
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
    },
  },
  security: [{ sessionCookie: [] }],
  paths: {
    "/api/health": {
      get: {
        tags: ["Jobs"],
        summary: "Liveness probe (public).",
        security: [],
        responses: {
          200: ok({
            type: "object",
            properties: {
              ok: { type: "boolean" },
              service: { type: "string" },
              version: { type: "string" },
            },
          }),
        },
      },
    },
    "/api/openapi.json": {
      get: {
        tags: ["Jobs"],
        summary: "This document (public).",
        security: [],
        responses: {
          200: ok({ type: "object", description: "OpenAPI 3.1 description of this API." }),
        },
      },
    },
    "/api/auth/sign-up/email": {
      post: {
        tags: ["Auth"],
        summary: "Create an account (email + password).",
        security: [],
        requestBody: jsonBody({
          type: "object",
          required: ["email", "password", "name"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            name: { type: "string" },
          },
        }),
        responses: { 200: ok({ type: "object" }), 403: errorResponse },
      },
    },
    "/api/auth/sign-in/email": {
      post: {
        tags: ["Auth"],
        summary: "Sign in; sets the session cookie used by every other endpoint.",
        security: [],
        requestBody: jsonBody({
          type: "object",
          required: ["email", "password"],
          properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
        }),
        responses: { 200: ok({ type: "object" }), 401: errorResponse },
      },
    },
    "/api/auth/get-session": {
      get: {
        tags: ["Auth"],
        summary: "Current session (user + active organization).",
        responses: { 200: ok({ type: "object" }) },
      },
    },
    "/api/auth/organization/list": {
      get: {
        tags: ["Auth"],
        summary: "Organizations the user belongs to.",
        responses: { 200: ok({ type: "array", items: { type: "object" } }) },
      },
    },
    "/api/auth/organization/create": {
      post: {
        tags: ["Auth"],
        summary: "Create an organization (caller becomes owner).",
        requestBody: jsonBody({
          type: "object",
          required: ["name", "slug"],
          properties: { name: { type: "string" }, slug: { type: "string" } },
        }),
        responses: { 200: ok({ type: "object" }), 400: errorResponse },
      },
    },
    "/api/auth/organization/set-active": {
      post: {
        tags: ["Auth"],
        summary: "Activate an organization; subsequent calls are scoped to it.",
        requestBody: jsonBody({
          type: "object",
          required: ["organizationId"],
          properties: { organizationId: { type: "string", format: "uuid" } },
        }),
        responses: { 200: ok({ type: "object" }) },
      },
    },
    "/api/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "List jobs in the active organization.",
        responses: {
          200: ok({ type: "object", properties: { jobs: { type: "array", items: job } } }),
          401: errorResponse,
        },
      },
      post: {
        tags: ["Jobs"],
        summary: "Create a job. Requires recruiter or owner.",
        requestBody: jsonBody({
          type: "object",
          required: ["title", "description"],
          properties: {
            title: { type: "string" },
            description: { type: "string", description: "The JD text; drives rubric derivation." },
            status: { type: "string", enum: ["draft", "open", "closed"] },
          },
        }),
        responses: { 201: ok({ type: "object", properties: { job } }), 401: errorResponse },
      },
    },
    "/api/jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "Job detail.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { 200: ok({ type: "object", properties: { job } }), 404: errorResponse },
      },
      patch: {
        tags: ["Jobs"],
        summary: "Update title/description/status. Requires recruiter or owner.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: jsonBody({
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["draft", "open", "closed"] },
          },
        }),
        responses: { 200: ok({ type: "object", properties: { job } }) },
      },
    },
    "/api/jobs/{jobId}/rubrics": {
      get: {
        tags: ["Rubrics"],
        summary: "All rubric versions for the job.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: ok({ type: "object", properties: { rubrics: { type: "array", items: rubric } } }),
        },
      },
      post: {
        tags: ["Rubrics"],
        summary: "Import a rubric JSON (validated; version auto-incremented).",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: jsonBody({ type: "object", properties: { rubric } }),
        responses: { 201: ok({ type: "object", properties: { rubric } }), 422: errorResponse },
      },
    },
    "/api/jobs/{jobId}/rubrics/{version}": {
      get: {
        tags: ["Rubrics"],
        summary: "One rubric version.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "version", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { 200: ok({ type: "object", properties: { rubric } }), 404: errorResponse },
      },
    },
    "/api/jobs/{jobId}/rubrics/derive": {
      post: {
        tags: ["Rubrics"],
        summary:
          "Derive a rubric from the JD with the LLM. Slugged criteria, six anchored levels, weights normalized. Requires LLM configuration.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: jsonBody({ type: "object" }),
        responses: {
          201: ok({ type: "object", properties: { rubric } }),
          503: {
            ...errorResponse,
            description: "`llm_not_configured` — no provider key in the environment.",
          },
          502: errorResponse,
        },
      },
    },
    "/api/jobs/{jobId}/candidates": {
      get: {
        tags: ["Candidates"],
        summary: "Candidate list with latest scores (read model).",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          {
            name: "blind",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["1", "true"] },
            description:
              "Mask identity cues (name/contact/school) while keeping evidence offsets aligned.",
          },
        ],
        responses: {
          200: ok({
            type: "object",
            properties: { candidates: { type: "array", items: candidate } },
          }),
        },
      },
      post: {
        tags: ["Candidates"],
        summary:
          "Upload one resume (multipart `.txt/.md/.pdf`). Text is extracted, hashed, and deduplicated per job.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: {
          201: ok({
            type: "object",
            properties: {
              candidate,
              deduped: {
                type: "boolean",
                description: "True when the content hash already existed.",
              },
            },
          }),
          415: errorResponse,
        },
      },
    },
    "/api/jobs/{jobId}/candidates/zip": {
      post: {
        tags: ["Candidates"],
        summary: "Bulk upload a ZIP of resumes; per-file dedupe, per-file errors reported.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary", description: "ZIP archive" },
                },
              },
            },
          },
        },
        responses: {
          201: ok({
            type: "object",
            properties: {
              created: { type: "integer" },
              deduped: { type: "integer" },
              failed: { type: "array", items: { type: "object" } },
            },
          }),
        },
      },
    },
    "/api/jobs/{jobId}/candidates/{candidateId}": {
      get: {
        tags: ["Candidates"],
        summary: "Candidate detail: documents, runs, decision history.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          {
            name: "candidateId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: { 200: ok({ type: "object" }), 404: errorResponse },
      },
    },
    "/api/jobs/{jobId}/candidates/{candidateId}/demographics": {
      put: {
        tags: ["Bias audit"],
        summary:
          "Opt-in demographic self-report (gender / race / age band / disability). Merged per dimension; used only for aggregate adverse-impact math.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          {
            name: "candidateId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: jsonBody({
          type: "object",
          properties: {
            gender: { type: "string", nullable: true },
            race: { type: "string", nullable: true },
            ageBand: { type: "string", nullable: true },
            disability: { type: "string", nullable: true },
          },
        }),
        responses: { 200: ok({ type: "object" }) },
      },
    },
    "/api/jobs/{jobId}/score": {
      post: {
        tags: ["Scoring"],
        summary:
          "Kick off scoring of all unprocessed candidates against the latest rubric. Returns a run id; poll the runs endpoint. Requires LLM configuration.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: jsonBody({ type: "object" }),
        responses: {
          202: ok({
            type: "object",
            properties: {
              runId: { type: "string", format: "uuid" },
              total: { type: "integer" },
            },
          }),
          409: errorResponse,
          503: errorResponse,
        },
      },
    },
    "/api/jobs/{jobId}/runs": {
      get: {
        tags: ["Scoring"],
        summary: "Scoring runs for this job (most recent first).",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: ok({
            type: "object",
            properties: { runs: { type: "array", items: { type: "object" } } },
          }),
        },
      },
    },
    "/api/jobs/{jobId}/runs/{runId}": {
      get: {
        tags: ["Scoring"],
        summary: "Run detail: per-candidate overall scores and per-criterion evidence spans.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "runId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: ok({
            type: "object",
            properties: {
              run: { type: "object" },
              candidates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    candidateId: { type: "string", format: "uuid" },
                    overall: { type: "number", description: "Weighted 0–100 aggregate." },
                    criteria: { type: "array", items: scoreRow },
                  },
                },
              },
            },
          }),
          404: errorResponse,
        },
      },
    },
    "/api/jobs/{jobId}/review": {
      get: {
        tags: ["Review"],
        summary: "Review queue: candidates with latest stage and scores, blind-masked on request.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: ok({
            type: "object",
            properties: { rows: { type: "array", items: { type: "object" } } },
          }),
        },
      },
    },
    "/api/jobs/{jobId}/decisions": {
      post: {
        tags: ["Review"],
        summary:
          "Record a pipeline decision (stage + required reason). Written to the hash-chained audit log; feeds bias metrics.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: jsonBody({
          type: "object",
          required: ["candidateId", "stage", "reason"],
          properties: {
            candidateId: { type: "string", format: "uuid" },
            stage: {
              type: "string",
              enum: ["new", "shortlisted", "advanced", "offer", "rejected"],
            },
            reason: {
              type: "string",
              minLength: 1,
              description: "Free text; mandatory by design.",
            },
          },
        }),
        responses: { 201: ok({ type: "object" }), 422: errorResponse },
      },
    },
    "/api/jobs/{jobId}/scores/{scoreId}": {
      patch: {
        tags: ["Review"],
        summary:
          "Human override of a single criterion score; original value is preserved in the audit trail.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          {
            name: "scoreId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: jsonBody({
          type: "object",
          required: ["score"],
          properties: { score: { type: "integer", minimum: 0, maximum: 5 } },
        }),
        responses: { 200: ok({ type: "object" }) },
      },
    },
    "/api/jobs/{jobId}/bias-audit": {
      post: {
        tags: ["Bias audit"],
        summary:
          "Adverse-impact report for one dimension: selection rates, four-fifths rule verdict, demographic parity difference. Non-reporters bucket as `undisclosed`.",
        parameters: [
          { name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: jsonBody({
          type: "object",
          required: ["dimension"],
          properties: {
            dimension: { type: "string", enum: ["gender", "race", "ageBand", "disability"] },
          },
        }),
        responses: {
          200: ok({
            type: "object",
            properties: {
              dimension: { type: "string" },
              verdict: {
                type: "string",
                enum: ["pass", "flag"],
                description: "Four-fifths (80%) rule.",
              },
              groups: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    group: { type: "string" },
                    considered: { type: "integer" },
                    selected: { type: "integer" },
                    selectionRate: { type: "number", nullable: true },
                    impactRatio: { type: "number", nullable: true },
                    fourFifths: { type: "string", enum: ["pass", "flag", "n/a"] },
                  },
                },
              },
              disclaimer: { type: "string" },
            },
          }),
        },
      },
    },
  },
} as const;
