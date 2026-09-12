#!/usr/bin/env node
/**
 * hirelens — the HireLens CLI.
 *
 * Ships as pure TypeScript (Node ≥ 22.6 runs it via native type
 * stripping), zero runtime dependencies. Engineers embed HireLens in
 * any pipeline:
 *
 *   hirelens login you@corp.com            # password via prompt/env
 *   hirelens jobs create "Backend Eng" --jd jd.md
 *   hirelens rubric derive <jobId>         # LLM JD → rubric
 *   hirelens score <jobId> ./resumes/      # upload + score + ranked output
 *
 * Configuration lives in ~/.hirelens/config.json (override the dir with
 * HIRELENS_CONFIG_DIR, the URL with HIRELENS_API_URL).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { ApiError, get, login, post, upload } from "./api.ts";
import { type CliConfig, clearSession, loadConfig, saveConfig } from "./config.ts";
import { table } from "./output.ts";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

/** Minimal arg parser: --key value / --key=value / bare booleans. */
function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags.set(arg.slice(2), next);
          i++;
        } else {
          flags.set(arg.slice(2), true);
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  // Let stdio flush before the process ends (Windows libuv assertion
  // otherwise fires when open sockets race the exit).
  setImmediate(() => process.exit(1));
  process.exitCode = 1;
  throw new Error("unreachable");
}

async function requireAuth(): Promise<CliConfig> {
  const config = loadConfig();
  if (!config.cookie) {
    fail("not signed in — run `hirelens login <email>` first (or set HIRELENS_COOKIE for CI).");
  }
  return config;
}

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

// ---------- API response shapes (the fields the CLI reads) ----------

interface JobRow {
  id?: string;
  title?: string;
  status?: string;
  createdAt?: string;
}
interface RubricRow {
  id?: string;
  version?: number;
  createdAt?: string;
  payload?: { title?: string } | null;
}
interface UploadResult {
  candidateId?: string;
  status?: string;
}
interface ScoreSummary {
  runId?: string;
  total?: number;
  scored?: number;
  failed?: number;
}
interface CandidateMetaRow {
  id?: string;
  sourceFileKey?: string | null;
}
interface RunCriterion {
  criterionKey?: string;
  score?: number;
  evidence?: Array<{ quotedText?: string }> | null;
}
interface RunCandidate {
  candidateId?: string;
  overall?: number | null;
  criteria?: RunCriterion[];
}

// ---------- commands ----------

async function cmdLogin(args: ParsedArgs): Promise<void> {
  const email = args.positional[0];
  if (!email) fail("usage: hirelens login <email>");
  const password = args.flags.get("password");
  const plain =
    typeof password === "string"
      ? password
      : (process.env["HIRELENS_PASSWORD"] ?? (await promptHidden("Password: ")));
  const config = await login(loadConfig(), email, plain);
  saveConfig(config);
  console.log(`Signed in as ${email} (session saved locally).`);
}

async function cmdWhoami(): Promise<void> {
  const config = await requireAuth();
  const body = await get(config, "/api/auth/get-session");
  const user = (body["user"] ?? body) as { email?: string } | undefined;
  console.log(user?.email ?? "signed in");
}

async function cmdLogout(): Promise<void> {
  clearSession();
  console.log("Signed out (local session cleared).");
}

async function cmdJobs(args: ParsedArgs): Promise<void> {
  const config = await requireAuth();
  const sub = args.positional[0] ?? "list";

  if (sub === "list") {
    const body = await get(config, "/api/jobs");
    const jobs = (body["jobs"] as JobRow[] | undefined) ?? [];
    console.log(
      table([
        ["ID", "TITLE", "STATUS", "CREATED"],
        ...jobs.map((j) => [
          j.id ?? "",
          j.title ?? "",
          j.status ?? "",
          (j.createdAt ?? "").slice(0, 10),
        ]),
      ]),
    );
    return;
  }

  if (sub === "create") {
    const title = args.positional[1];
    if (!title) fail("usage: hirelens jobs create <title> --jd <jdfile.md>");
    const jdPath = args.flags.get("jd");
    let description = "";
    if (typeof jdPath === "string") {
      description = readFileSync(jdPath, "utf8");
    } else if (!process.stdin.isTTY) {
      description = readFileSync(0, "utf8");
    }
    if (!description.trim()) fail("a job description is required: --jd <file> or pipe it on stdin");
    const body = await post(config, "/api/jobs", { title, description, status: "open" });
    const job = body["job"] as JobRow | undefined;
    if (job?.id) console.log(`Created job ${job.id} — ${job.title ?? title}`);
    return;
  }

  fail(`unknown subcommand "${sub}" (expected: list, create)`);
}

interface OrgRow {
  id?: string;
  name?: string;
}

async function cmdOrg(args: ParsedArgs): Promise<void> {
  const config = await requireAuth();
  const sub = args.positional[0] ?? "list";

  if (sub === "list") {
    const body = await get(config, "/api/auth/organization/list");
    const orgs = (Array.isArray(body) ? body : (body["data"] as unknown)) as OrgRow[] | undefined;
    console.log(table([["ID", "NAME"], ...(orgs ?? []).map((o) => [o.id ?? "", o.name ?? ""])]));
    return;
  }

  if (sub === "create") {
    const name = args.positional.slice(1).join(" ");
    if (!name) fail('usage: hirelens org create "Acme Hiring"');
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    const body = await post(config, "/api/auth/organization/create", { name, slug });
    const org = (body as { data?: OrgRow }).data ?? (body as unknown as OrgRow) ?? {};
    if (org.id) {
      await post(config, "/api/auth/organization/set-active", { organizationId: org.id });
      console.log(`Created and activated org "${org.name ?? name}" (${org.id})`);
    }
    return;
  }

  if (sub === "use") {
    const id = args.positional[1];
    if (!id) fail("usage: hirelens org use <orgId>");
    await post(config, "/api/auth/organization/set-active", { organizationId: id });
    console.log(`Active org: ${id}`);
    return;
  }

  fail(`unknown subcommand "${sub}" (expected: list, create, use)`);
}

async function cmdRubric(args: ParsedArgs): Promise<void> {
  const config = await requireAuth();
  const sub = args.positional[0] ?? "list";
  const jobId = args.positional[1];
  if (!jobId) fail("usage: hirelens rubric <list|derive|import> <jobId> [--file rubric.json]");

  if (sub === "list") {
    const body = await get(config, `/api/jobs/${jobId}/rubrics`);
    const rubrics = (body["rubrics"] as RubricRow[] | undefined) ?? [];
    console.log(
      table([
        ["VERSION", "TITLE", "ID", "CREATED"],
        ...rubrics.map((r) => [
          String(r.version ?? ""),
          r.payload?.title ?? "",
          r.id ?? "",
          (r.createdAt ?? "").slice(0, 10),
        ]),
      ]),
    );
    return;
  }

  if (sub === "derive") {
    const body = await post(config, `/api/jobs/${jobId}/rubrics/derive`, {});
    const rubric = body["rubric"] as RubricRow | undefined;
    const promptHash = typeof body["promptHash"] === "string" ? body["promptHash"] : "";
    console.log(`Derived rubric v${rubric?.version ?? "?"} (prompt ${promptHash})`);
    return;
  }

  if (sub === "import") {
    const file = args.flags.get("file");
    if (typeof file !== "string") fail("usage: hirelens rubric import <jobId> --file rubric.json");
    const rubric = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const body = await post(config, `/api/jobs/${jobId}/rubrics`, { rubric });
    const row = body["rubric"] as RubricRow | undefined;
    console.log(`Imported rubric v${row?.version ?? "?"}`);
    return;
  }

  fail(`unknown subcommand "${sub}" (expected: list, derive, import)`);
}

interface ResumeFile {
  name: string;
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
}

async function loadResume(path: string): Promise<ResumeFile> {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const mime = MIME[ext];
  if (!mime) fail(`unsupported resume type "${ext}" (pdf, docx, txt, md) — ${path}`);
  const buffer = await readFile(path);
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return {
    name: path.split(/[\\/]/).pop() ?? path,
    mime,
    bytes,
  };
}

async function collectResumes(paths: string[]): Promise<ResumeFile[]> {
  const out: ResumeFile[] = [];
  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const entry of readdirSync(p)) {
        if (entry.startsWith(".")) continue;
        const full = join(p, entry);
        if (statSync(full).isFile() && MIME[entry.slice(entry.lastIndexOf("."))] !== undefined) {
          out.push(await loadResume(full));
        }
      }
    } else {
      out.push(await loadResume(p));
    }
  }
  return out;
}

async function cmdScore(args: ParsedArgs): Promise<void> {
  const config = await requireAuth();
  const jobId = args.positional[0];
  const resumeArgs = args.positional.slice(1);
  if (!jobId || resumeArgs.length === 0) {
    fail("usage: hirelens score <jobId> <resumes...|directory> [--breakdown] [--json]");
  }
  const asJson = args.flags.get("json") === true;
  const breakdown = args.flags.get("breakdown") === true;

  // 1. Upload every resume (dedup is server-side per job).
  const files = await collectResumes(resumeArgs);
  for (const f of files) {
    const body = (await upload(config, `/api/jobs/${jobId}/candidates`, f)) as UploadResult;
    console.error(`↑ ${f.name} → ${body.status ?? "created"}`);
  }

  // 2. Kick off scoring (synchronous today; returns the completed summary).
  const kick = await post(config, `/api/jobs/${jobId}/score`, {});
  const summary = (kick["summary"] as ScoreSummary | undefined) ?? {};
  const runId = summary.runId;
  console.error(
    `Scored ${summary.scored ?? "?"}/${summary.total ?? "?"} (failed: ${summary.failed ?? "?"}) — run ${runId ?? "?"}`,
  );
  if (!runId) fail("scoring did not return a run id");

  // 3. Print the ranked result.
  const detail = await get(config, `/api/jobs/${jobId}/runs/${runId}`);
  const runCandidates = (detail["candidates"] as RunCandidate[] | undefined) ?? [];
  const meta = await get(config, `/api/jobs/${jobId}/candidates`);
  const metaRows = (meta["candidates"] as CandidateMetaRow[] | undefined) ?? [];
  const nameOf = new Map(metaRows.map((r) => [r.id ?? "", r.sourceFileKey ?? r.id ?? ""]));

  const ranked = [...runCandidates].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          runId,
          ranked: ranked.map((c, i) => ({
            rank: i + 1,
            candidateId: c.candidateId,
            name: nameOf.get(c.candidateId ?? "") ?? c.candidateId,
            overall: Math.round(c.overall ?? 0),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    table([
      ["RANK", "CANDIDATE", "OVERALL"],
      ...ranked.map((c, i) => [
        String(i + 1),
        nameOf.get(c.candidateId ?? "") ?? c.candidateId ?? "",
        String(Math.round(c.overall ?? 0)),
      ]),
    ]),
  );

  if (breakdown) {
    for (const c of ranked) {
      console.log(`\n${nameOf.get(c.candidateId ?? "") ?? c.candidateId}:`);
      console.log(
        table([
          ["CRITERION", "SCORE", "EVIDENCE"],
          ...(c.criteria ?? []).map((s) => [
            s.criterionKey ?? "",
            `${String(s.score ?? "")}/5`,
            (s.evidence?.[0]?.quotedText ?? "").slice(0, 60),
          ]),
        ]),
      );
    }
  }
}

// ---------- dispatch ----------

const HELP = `hirelens — score resumes against a job rubric from the terminal

Usage:
  hirelens login <email> [--password <pw>]   Sign in (session saved locally)
  hirelens whoami                            Show the signed-in user
  hirelens logout                            Clear the local session
  hirelens org list                          List your organizations
  hirelens org create "Acme Hiring"          Create + activate an organization
  hirelens org use <orgId>                   Switch the active organization
  hirelens jobs list                         List jobs in the active org
  hirelens jobs create <title> --jd <file>   Create a job (or pipe JD on stdin)
  hirelens rubric list <jobId>               List rubric versions
  hirelens rubric derive <jobId>             LLM-derive a rubric from the JD
  hirelens rubric import <jobId> --file f    Import a rubric JSON
  hirelens score <jobId> <resumes...|dir>    Upload + score + print ranking
      --breakdown                            Also print per-criterion details
      --json                                 Machine-readable ranked output
  hirelens version                           Print the version

Environment: HIRELENS_API_URL, HIRELENS_COOKIE, HIRELENS_PASSWORD,
HIRELENS_CONFIG_DIR.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [command = "help"] = argv;
  const args = parseArgs(argv.slice(1));
  try {
    switch (command) {
      case "login": {
        await cmdLogin(args);
        break;
      }
      case "whoami": {
        await cmdWhoami();
        break;
      }
      case "logout": {
        await cmdLogout();
        break;
      }
      case "jobs": {
        await cmdJobs(args);
        break;
      }
      case "org": {
        await cmdOrg(args);
        break;
      }
      case "rubric": {
        await cmdRubric(args);
        break;
      }
      case "score": {
        await cmdScore(args);
        break;
      }
      case "version":
      case "--version":
      case "-v": {
        console.log("hirelens 0.1.0");
        break;
      }
      case "help":
      case "--help":
      case "-h": {
        console.log(HELP);
        break;
      }
      default: {
        console.log(HELP);
        console.error(`\nunknown command "${command}"`);
        process.exit(1);
      }
    }
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`error [${err.status} ${err.code}]: ${err.message}`);
    } else {
      console.error(err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  }
}

await main();
