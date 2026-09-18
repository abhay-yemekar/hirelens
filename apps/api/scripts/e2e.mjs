/**
 * End-to-end integrity check against a live deployment.
 *
 * Signs up a fresh account, creates a job + rubric, uploads three named
 * resumes, scores them, retries any rate-limit failures, and asserts:
 *   - every candidate appears in the review queue (or is named as failed)
 *   - candidate detail opens for every scored candidate
 *   - labels are pretty-printed ("Alice Johnson", not "Alice_Johnson.txt")
 *
 * Usage: node scripts/e2e.mjs [baseUrl] [email] [password]
 * Requires the deployment to have an LLM key configured (real scoring).
 */
import { strToU8 } from "fflate";

const BASE = process.argv[2] ?? "http://localhost:3001";
const EMAIL = process.argv[3] ?? `e2e-${Date.now()}@hirelens.test`;
const PASSWORD = process.argv[4] ?? "e2e-password-123";
const MAX_RETRY_ROUNDS = 3;

const RESUMES = [
  {
    name: "alice_johnson.txt",
    text: `Alice Johnson
alice.johnson@example.com

EXPERIENCE
Senior Backend Engineer — NimbusPay (2020-present)
- Designed event-driven payment services on Kafka handling 30k req/s.
- Owned PostgreSQL schema for a 100M-row ledger; tuned p95 to 40ms.
- Led incident response; wrote runbooks and cut MTTR 40%.

SKILLS
TypeScript, Node.js, PostgreSQL, Kafka, Redis, Docker

EDUCATION
B.S. Computer Science, State University (2013-2017)`,
  },
  {
    name: "bob_marsh.txt",
    text: `Bob Marsh
bob.marsh@example.com

EXPERIENCE
Junior Developer — TinyApps (2022-present)
- Built REST endpoints in Node.js for an internal CRM.
- Wrote unit tests; fixed bugs across the web app.

SKILLS
JavaScript, Node.js, PostgreSQL (basics)

EDUCATION
B.A. Information Systems, City College (2018-2022)`,
  },
  {
    name: "carla_diaz.txt",
    text: `Carla Diaz
carla.diaz@example.com

EXPERIENCE
Backend Engineer — Ledgerly (2019-2024)
- Built settlement services; exactly-once processing with idempotency keys.
- Operated PostgreSQL at scale; designed sharding for the payments ledger.
- Ran the on-call rotation; drove chaos-testing adoption.

SKILLS
Go, Java, PostgreSQL, Kafka, Kubernetes

EDUCATION
M.S. Software Engineering, Tech Institute (2015-2019)`,
  },
];

function rubric() {
  const levels = [
    ["None", "No relevant evidence in the resume."],
    ["Aware", "Mentions the area in passing."],
    ["Assisted", "Contributed under guidance."],
    ["Independent", "Owned a non-trivial piece."],
    ["Lead", "Led design and mentored others."],
    ["Authority", "Led multi-team efforts at scale."],
  ].map(([label, description]) => ({ label, description }));
  const defs = [
    ["event-driven-systems", "Event-driven & queue architecture", 3],
    ["postgres-at-scale", "PostgreSQL at scale", 3],
    ["distributed-systems", "Distributed systems fundamentals", 2],
    ["reliability-ops", "Reliability & incident response", 2],
    ["communication", "Written communication", 1],
  ];
  return {
    version: 1,
    key: "e2e-backend",
    title: "E2E Backend Engineer",
    criteria: defs.map(([key, title, weight]) => ({
      key,
      title,
      weight,
      scale: levels,
      doNotUse: ["photo", "age", "gender"],
    })),
    exclusions: [],
  };
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`E2E against ${BASE}\n`);

  // 1. Sign up a fresh account.
  const origin = new URL(BASE).origin;
  const signup = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ name: "E2E Tester", email: EMAIL, password: PASSWORD }),
  });
  const setCookie = signup.headers.getSetCookie?.() ?? [];
  let cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  check("sign-up", signup.ok && Boolean(cookie), `status ${signup.status}`);
  if (!cookie) throw new Error("no session cookie — aborting");

  const headers = () => ({
    "content-type": "application/json",
    cookie,
    origin,
  });

  // 2. Org: create + activate (job routes need an active org).
  const slug = `e2e-${Date.now().toString(36)}`;
  await fetch(`${BASE}/api/auth/organization/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: "E2E Org", slug }),
  });
  const setActive = await fetch(`${BASE}/api/auth/organization/set-active`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ organizationSlug: slug }),
  });
  const refreshed = setActive.headers.getSetCookie?.() ?? [];
  cookie = [...setCookie, ...refreshed].map((c) => c.split(";")[0]).join("; ");
  check("organization ready", setActive.ok);

  // 3. Job + rubric.
  const jobRes = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title: `E2E integrity ${new Date().toISOString().slice(0, 16)}`,
      description:
        "Senior backend engineer. Event-driven systems, PostgreSQL at scale, distributed systems, reliability, communication.",
    }),
  });
  const job = (await jobRes.json()).job;
  check("job created", jobRes.ok && Boolean(job?.id));
  const rubricRes = await fetch(`${BASE}/api/jobs/${job.id}/rubrics`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ rubric: rubric() }),
  });
  check("rubric imported", rubricRes.ok, `status ${rubricRes.status}`);

  // 4. Upload the three named resumes.
  for (const r of RESUMES) {
    const form = new FormData();
    form.append("file", new Blob([strToU8(r.text)], { type: "text/plain" }), r.name);
    const up = await fetch(`${BASE}/api/jobs/${job.id}/candidates`, {
      method: "POST",
      headers: { cookie, origin },
      body: form,
    });
    check(`upload ${r.name}`, up.ok, `status ${up.status}`);
  }

  // 5. Score, then retry-failed until everyone scores or retries run out.
  let summary = null;
  for (let round = 0; round <= MAX_RETRY_ROUNDS; round++) {
    if (round === 0) {
      const scoreRes = await fetch(`${BASE}/api/jobs/${job.id}/score`, {
        method: "POST",
        headers: headers(),
      });
      const scoreBody = await scoreRes.json();
      if (!scoreRes.ok) {
        check("scoring kickoff", false, `${scoreRes.status} ${scoreBody.error}`);
        throw new Error("scoring failed");
      }
      summary = scoreBody.summary;
    } else {
      if (summary.failed === 0) break;
      const runsRes = await fetch(`${BASE}/api/jobs/${job.id}/runs`, { headers: headers() });
      const runs = (await runsRes.json()).runs;
      const failedRun = runs.find((r) => (r.failures?.length ?? 0) > 0);
      if (!failedRun) break;
      const retryRes = await fetch(`${BASE}/api/jobs/${job.id}/runs/${failedRun.id}/retry-failed`, {
        method: "POST",
        headers: headers(),
      });
      const retryBody = await retryRes.json();
      if (!retryRes.ok) {
        check("retry-failed", false, `${retryRes.status} ${retryBody.error}`);
        break;
      }
      summary = {
        ...retryBody.summary,
        total: summary.total,
        scored: (summary.scored ?? 0) + retryBody.summary.scored,
        failed: retryBody.summary.failed,
        results: retryBody.summary.results,
      };
      console.log(
        `  retry round ${round}: scored ${retryBody.summary.scored}, failed ${retryBody.summary.failed}`,
      );
    }
  }
  check(
    `all ${RESUMES.length} candidates scored (with retries)`,
    summary.scored === RESUMES.length,
    `scored ${summary.scored}/${summary.total}`,
  );

  // 6. Review queue: every candidate present with pretty labels.
  const reviewRes = await fetch(`${BASE}/api/jobs/${job.id}/review`, { headers: headers() });
  const review = (await reviewRes.json()).review;
  check(
    "review queue has every candidate",
    review.length === RESUMES.length,
    `queue has ${review.length}`,
  );
  for (const expected of RESUMES) {
    const pretty = expected.name.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ");
    const found = review.find((r) => r.label === pretty);
    check(`label "${pretty}"`, Boolean(found), `got: ${review.map((r) => r.label).join(", ")}`);
  }

  // 7. Candidate detail opens for every scored candidate.
  const candRes = await fetch(`${BASE}/api/jobs/${job.id}/candidates`, { headers: headers() });
  const cands = (await candRes.json()).candidates;
  for (const c of cands) {
    const detail = await fetch(`${BASE}/api/jobs/${job.id}/candidates/${c.id}`, {
      headers: headers(),
    });
    const body = await detail.json();
    check(
      `candidate detail opens (${c.id.slice(0, 8)})`,
      detail.ok && body.documents?.length > 0,
      `status ${detail.status}`,
    );
  }

  // 8. Run detail: every scored candidate appears with criteria.
  const runsRes = await fetch(`${BASE}/api/jobs/${job.id}/runs`, { headers: headers() });
  const runs = (await runsRes.json()).runs;
  const bestRun = runs.find((r) => r.status === "completed" && !(r.failures?.length > 0));
  if (bestRun) {
    const runRes = await fetch(`${BASE}/api/jobs/${job.id}/runs/${bestRun.id}`, {
      headers: headers(),
    });
    const runDetail = await runRes.json();
    check(
      "run detail lists every scored candidate",
      runDetail.candidates.length === RESUMES.length,
      `got ${runDetail.candidates.length}`,
    );
  }

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("E2E FAILED:", err.message);
  process.exit(1);
});
