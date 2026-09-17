/**
 * Day 19 load test: 200-resume bulk upload + read-path timings.
 *
 * Usage: node scripts/loadtest.mjs [baseUrl] [email] [password]
 * Defaults to the local Docker API with the QA account. Creates its own
 * job, uploads a generated 200-resume ZIP, times the read endpoints,
 * and prints a summary table.
 */
import { strToU8, zipSync } from "fflate";

const API = process.argv[2] ?? "http://localhost:4000";
const EMAIL = process.argv[3] ?? "qa@hirelens.local";
const PASSWORD = process.argv[4] ?? "qa-password-123";
const RESUME_COUNT = Number(process.env.RESUME_COUNT ?? 200);
const SKIP_SCORE = process.env.SKIP_SCORE === "1";

function generateResume(i) {
  const skills = ["Python", "SQL", "Docker", "Kubernetes", "React", "Node.js", "Go", "Rust"];
  const chosen = skills.slice(0, (i % skills.length) + 1).join(", ");
  return `Load Test Candidate ${i}

Email: candidate${i}@loadtest.example
Location: Springfield

Summary
Senior engineer with ${5 + (i % 15)} years of experience building distributed systems
and leading cross-functional teams across multiple product areas.

Experience
Senior Software Engineer — Company ${i % 7} (2018-202${i % 10})
- Designed and operated services handling ${10 * ((i % 90) + 1)}k requests per second
- Led migration of the monolith to event-driven microservices in ${chosen}
- Mentored ${2 + (i % 8)} junior engineers and ran the interview loop

Skills: ${chosen}, System Design, Testing, Communication

Education
B.S. Computer Science — State University (201${i % 10})
`;
}

async function main() {
  // Sign in (cookies kept in-memory via manual header juggling is overkill;
  // node fetch keeps cookies per-process only with an agent, so capture it).
  const signin = await fetch(`${API}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3001" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookie = signin.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error(`sign-in failed: ${signin.status}`);
  const authHeaders = {
    cookie,
    "content-type": "application/json",
    origin: "http://localhost:3001",
  };

  // Create + activate an org for this account (job routes require an active org).
  await fetch(`${API}/api/auth/organization/create`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "Load Test Org", slug: "load-test-org" }),
  }).catch(() => {});
  const setActive = await fetch(`${API}/api/auth/organization/set-active`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ organizationSlug: "load-test-org" }),
  });
  // set-active may rotate the session cookie — pick up the new one.
  const refreshed = setActive.headers.getSetCookie?.() ?? [];
  const allCookies = [...setCookie, ...refreshed];
  const finalCookie = allCookies.length
    ? allCookies.map((c) => c.split(";")[0]).join("; ")
    : cookie;
  authHeaders.cookie = finalCookie;

  /** Build a valid 5-criterion rubric programmatically (levels generated). */
  function demoRubric() {
    const defs = [
      ["backend-eng:system-design", "System design", 3],
      ["backend-eng:data-modeling", "Data modeling", 2],
      ["backend-eng:testing", "Testing discipline", 2],
      ["backend-eng:operations", "Operations & reliability", 2],
      ["core:communication", "Written communication", 1],
    ];
    const levelText = [
      ["None", "No relevant evidence in the resume."],
      ["Aware", "Mentions the area only in passing, no own work."],
      ["Assisted", "Contributed on a team under close guidance."],
      ["Independent", "Owned a non-trivial piece end to end."],
      ["Lead", "Led the design and mentored others in the area."],
      ["Authority", "Repeatedly led multi-team efforts, with scale evidence."],
    ];
    return {
      version: 1,
      key: "backend-eng-loadtest",
      title: "Load Test Backend Engineer",
      criteria: defs.map(([key, title, weight]) => ({
        key,
        title,
        weight,
        scale: levelText.map(([label, description]) => ({ label, description })),
        doNotUse: ["photo", "age", "gender"],
      })),
      exclusions: [],
    };
  }

  // Create a dedicated job for this run.
  const jobRes = await fetch(`${API}/api/jobs`, {
    method: "POST",
    headers: { ...authHeaders, cookie: finalCookie },
    body: JSON.stringify({
      title: `Load test ${new Date().toISOString().slice(0, 16)}`,
      description:
        "Senior backend engineer role. We value system design, databases, testing discipline, operational excellence, and clear written communication.",
    }),
  });
  const job = (await jobRes.json()).job;

  // Provision a rubric so scoring can run.
  const rubricRes = await fetch(`${API}/api/jobs/${job.id}/rubrics`, {
    method: "POST",
    headers: { ...authHeaders, cookie: finalCookie },
    body: JSON.stringify({ rubric: demoRubric() }),
  });
  if (!rubricRes.ok)
    throw new Error(
      `rubric create failed: ${rubricRes.status} ${(await rubricRes.text()).slice(0, 200)}`,
    );

  // Build the 200-resume zip.
  const files = {};
  for (let i = 0; i < RESUME_COUNT; i++)
    files[`resume-${String(i).padStart(3, "0")}.txt`] = strToU8(generateResume(i));
  const zip = zipSync(files);

  // Upload it (the zip endpoint ingests every entry).
  const t0 = performance.now();
  const form = new FormData();
  form.append("file", new Blob([zip], { type: "application/zip" }), "loadtest-resumes.zip");
  const upRes = await fetch(`${API}/api/jobs/${job.id}/candidates/zip`, {
    method: "POST",
    headers: { cookie: finalCookie },
    body: form,
  });
  const upBody = await upRes.json();
  const uploadMs = Math.round(performance.now() - t0);
  if (!upRes.ok)
    throw new Error(`upload failed: ${upRes.status} ${JSON.stringify(upBody).slice(0, 300)}`);

  // Time the read paths.
  async function timed(path) {
    const t = performance.now();
    const res = await fetch(`${API}${path}`, { headers: { cookie: finalCookie } });
    await res.json();
    return { ms: Math.round(performance.now() - t), status: res.status };
  }

  const candidates = await timed(`/api/jobs/${job.id}/candidates`);
  const rubrics = await timed(`/api/jobs/${job.id}/rubrics`);
  const runs = await timed(`/api/jobs/${job.id}/runs`);

  // Score with the real configured LLM (may take a while) — only if a key
  // is set on the server; otherwise the 503 path is expected.
  let scoring = null;
  if (SKIP_SCORE) {
    scoring = { skipped: true, status: 0, error: "SKIP_SCORE=1" };
  } else {
    const tS = performance.now();
    const scoreRes = await fetch(`${API}/api/jobs/${job.id}/score`, {
      method: "POST",
      headers: { ...authHeaders, cookie: finalCookie },
    });
    const scoreBody = await scoreRes.json();
    if (scoreRes.ok) {
      scoring = { ms: Math.round(performance.now() - tS), ...scoreBody.summary };
    } else {
      scoring = { skipped: true, status: scoreRes.status, error: scoreBody.error };
    }
  }

  // Read paths again with a full review table present.
  const review = await timed(`/api/jobs/${job.id}/review`);
  const candidatesAfter = await timed(`/api/jobs/${job.id}/candidates`);

  console.log("\n=== HireLens load test — 200 resumes ===");
  console.log(`job:            ${job.id}`);
  console.log(
    `zip upload:     ${uploadMs} ms (created ${upBody.created}, dup ${upBody.duplicates}, skipped ${upBody.skipped?.length ?? 0})`,
  );
  console.log(
    `GET candidates: ${candidates.ms} ms (before) → ${candidatesAfter.ms} ms (after scoring)`,
  );
  console.log(`GET rubrics:    ${rubrics.ms} ms`);
  console.log(`GET runs:       ${runs.ms} ms`);
  console.log(`GET review:     ${review.ms} ms (${review.status})`);
  console.log(
    `scoring:        ${scoring.skipped ? `skipped (${scoring.error})` : `${scoring.ms} ms — scored ${scoring.scored}/${scoring.total}, failed ${scoring.failed}`}`,
  );
}

main().catch((err) => {
  console.error("LOAD TEST FAILED:", err.message);
  process.exit(1);
});
