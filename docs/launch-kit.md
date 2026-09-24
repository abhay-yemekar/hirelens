# HireLens — Launch Day Kit

Everything below is copy-paste ready. Nothing here requires code changes.
Suggested order: Product Hunt first (Tuesday–Thursday, 12:01am PT), Show HN
the same morning (~8–10am PT, weekday), then LinkedIn/X with the GIF.

Pre-flight checklist (do the day before):

- [x] Demo GIF: **done — `docs/demo.gif`** (auto-generated; re-run
      `node scripts/record-demo.mjs && node scripts/frames-to-gif.mjs` with
      the dev server on :3001 after any scoring-UI change). It's embedded
      at the top of the README.
- [x] Repo social preview: set to `.github/social-preview.png` — also
      re-upload `docs/demo.gif` in Settings → Social preview if you want
      motion in the OG card (GitHub accepts GIFs there).
- [ ] Confirm https://hirelens-rosy.vercel.app/demo works logged-out.
- [ ] Confirm Discussions is enabled (it is) and pin a "Welcome" thread.
- [ ] Reply-squad ready: block 3 hours after posting; early comments decide
      the HN front page.

---

## 1. Show HN post

**Title** (lowercase, factual, no hype — HN punishes marketing speak):

```
Show HN: HireLens – open-source resume screening that shows its evidence
```

**Text:**

```
Hi HN! I'm Abhay. I spent years watching hiring tools make decisions about
people with a number and no justification — so I built the opposite.

HireLens is an open-source (MIT) resume screener where every AI score must
link to the exact evidence that produced it. Each criterion score (0–5)
carries a quoted span from the resume at its exact character offset; click
the score and the quote lights up in the document. Every decision needs a
recorded reason, the whole trail is hash-chained (tampering breaks it
visibly), and there's a one-click adverse-impact audit using the EEOC
four-fifths rule.

The stack: Next.js + Hono + Postgres/pgvector, model-agnostic LLM layer
(Google, Anthropic, Groq, OpenRouter, or fully local via Ollama). Rubrics
are versioned JSON the recruiter controls — the LLM scores against YOUR
anchored scale, not its own vibes.

Things I'm proud of:
- Interview kits: probe questions generated from the same anchored scale the
  model scored against, plus the exact quotes as a listen-for list
- A candidate portal: candidates opt in to demographics via a one-shot token
  link — the bias audit never gets its data by scraping
- Blind review mode: hide names server-side while deciding
- Semantic search/ask over resumes with server-verified citations
- A 200-resume load test and an eval harness (position bias, name-swap bias,
  self-consistency) that runs in CI

Try it without an account: https://hirelens-rosy.vercel.app/demo
Self-host: docker compose up --build -d
Code: https://github.com/abhay-yemekar/hirelens

Honest caveats: it's a screening aid, not a hiring decision. The eval
numbers published in the README are from the mock model — the harness
plumbing is validated, real-model numbers need a paid key. And self-reported
demographics are exactly that: self-reported.

Happy to answer anything about the evidence-chain design, the bias audit
math, or why rubrics are recruiter-owned.
```

**First-comment strategy:** pin a comment showing the evidence viewer in one
sentence ("score → quote → highlight" flow), then answer honestly about the
mock-model caveat before anyone digs.

---

## 2. Product Hunt

**Tagline** (≤60 chars):

```
Resume screening that shows its evidence
```

**Description:**

```
HireLens is open-source, glass-box hiring intelligence. Candidates are
scored against a rubric you control, every point cites the exact resume
text behind it, decisions require recorded reasons, and the whole audit
trail is tamper-evident. Built-in adverse-impact reporting, blind review,
interview kits, and a candidate privacy portal. Self-host in one command
or use the free hosted beta.
```

**Topics:** AI, Human Resources, Open Source

**Maker comment:**

```
Hey PH! 👋 I'm Abhay, solo developer of HireLens.

The problem: AI hiring tools give you a number. If a candidate asks "why
was I rejected?", the honest answer is "I don't know."

HireLens never shows a naked number. Every criterion score links to the
exact quoted text that produced it — you click, the resume highlights, and
you can agree or override with a recorded reason. Everything is auditable:
decisions, overrides, and the scoring runs themselves live in a
tamper-evident hash chain.

What's free: the whole thing (MIT). Self-host with one Docker command, or
try the hosted beta with zero signup: the live demo runs the real scoring
engine on synthetic resumes.

I'd genuinely love feedback on the interview-kit feature — it turns the
same rubric the AI scored against into a structured human interview plan.
Is that useful? What's missing?
```

**Gallery:** 5 images — (1) evidence viewer mid-highlight, (2) review queue,
(3) bias audit report, (4) interview kit, (5) share-link report.

---

## 3. LinkedIn / X post

```
Most hiring AI is a black box. I built the opposite.

HireLens (open-source, MIT):
→ every AI score cites the exact resume text behind it
→ decisions require recorded reasons
→ tamper-evident audit trail
→ one-click adverse-impact (EEOC 4/5ths) audit
→ candidates opt in to demographics — never scraped
→ self-host in one command, or bring your own LLM key

Live demo, no signup: https://hirelens-rosy.vercel.app/demo
GitHub: https://github.com/abhay-yemekar/hirelens
```

---

## 4. After launch (48h)

- Reply to every comment within an hour where possible; thank bug reports
  and file issues live ("filed — link") to show velocity.
- Post the demo GIF as a follow-up "how the evidence viewer works" reply on
  the Show HN thread rather than editing.
- Add a "As seen on HN / PH" line + launch date to the README status line.
- Triage feedback into: bugs (this week), v1.1 candidates (roadmap page),
  docs gaps (site docs).
- If HN picks it up: expect the "demographics self-report will be gamed"
  and "LLMs can't judge resumes" threads — answer with the blind-review +
  four-fifths math and the eval-harness section of the README, not with
  promises.
