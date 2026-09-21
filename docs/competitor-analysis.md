# HireLens vs. the field — competitor analysis & v1.1 plan

*Researched 21 September 2026. Sources: live site review (screenshots captured by
the founder) + product/pricing pages for each competitor. Checked against our
shipped v1.0 surface.*

## The landscape in one paragraph

Seven products were profiled: **Enhancv, Resume Worded, Jobscan, Naukri360,
CVViz, MyPerfectResume, and ResumeScreening.ai**. They split into three groups:
**candidate tools** (Enhancv, Resume Worded, Jobscan, Naukri360,
MyPerfectResume — resume builders, ATS checkers, LinkedIn optimizers sold to
job seekers at $20–30/mo), **recruiter ATS platforms** (CVViz — resume
screening + CRM at org scale), and our closest competitor, **ResumeScreening.ai**
(per-resume AI screening, $0.07/resume pay-as-you-go). **Nobody in the set
offers evidence-linked scoring, a candidate-side transparency surface, or an
auditable decision trail. That's the moat.**

## Feature matrix

| Capability | HireLens | ResumeScreening.ai | CVViz | Jobscan | Enhancv | Resume Worded | MyPerfectResume | Naukri360 |
|---|---|---|---|---|---|---|---|---|
| Bulk resume ranking vs a JD | ✅ rubric-based | ✅ per-resume $ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Evidence quote behind every score | ✅ exact offsets | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Recruiter-owned rubric (edit/version/fork) | ✅ JSON | ❌ black-box | partial | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bias audit (four-fifths) | ✅ one click | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tamper-evident audit log | ✅ hash chain | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Interview kits from anchors + evidence | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Candidate-facing transparency | 🔜 v1.1 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Blind review mode | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Self-host / data control | ✅ Docker + local LLM | ❌ SaaS | ❌ SaaS | ❌ | ❌ | ❌ | ❌ | ❌ |
| Resume builder / templates | ❌ (never — out of scope) | ❌ | ❌ | ✅ | ✅ | partial | ✅ | ✅ |
| LinkedIn optimization | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| ATS integrations | 🔜 v1.2 | partial | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pricing | MIT, self-host free | $0.07/resume | org quote | $49.95/mo* | $23.95/mo* | $29.99/mo* | $23.95/mo* | freemium |

\* competitor public list prices, subject to change; verified against public
pages Sept 2026.

## Site IA patterns worth copying (already shipped in PR #66)

All three flagship candidate sites (Enhancv, Jobscan, Resume Worded) use the
same nav grammar we adopted: **grouped mega-menu (Product / Resources /
Company)** with a persistent Sign in + primary CTA outside the hamburger, and
mobile menus grouped to mirror desktop. Their dropdown entries pair a label
with a one-line promise — exactly the two-line pattern our mega-menu uses.

Structural patterns observed across their pages, mapped to what we already ship
or deliberately reject:

| Pattern | Who uses it | Our take |
|---|---|---|
| Tool-first hero (drop your resume) | Resume Worded, Jobscan, Naukri360 | We ship a **live no-signup demo** hero CTA — stronger, because it runs the real engine |
| Grouped dropdown mega-menu | Enhancv, Jobscan, Resume Worded | ✅ Shipped |
| "As seen on" / trust logos | Resume Worded, Jobscan, CVViz | Rejected until real; fake social proof is dishonest |
| Feature→benefit two-line cards | all | ✅ Our features section follows it |
| Pricing per resume / per seat | ResumeScreening.ai, CVViz | We publish **free/self-host**; honesty is the differentiator |
| FAQ accordions | Jobscan, Naukri360 | ✅ Shipped |
| Deep content-SEO library (50+ guides) | Jobscan, Enhancv | Deferred — post-launch growth lever, needs writing capacity |

## Positioning statement

> **Enhancv, Jobscan, and Resume Worded help candidates beat the screener.
> CVViz and ResumeScreening.ai sell recruiters a black box. HireLens is the
> only open platform where the recruiter owns the rubric, every score shows
> its evidence, and the candidate can be shown why.**

## The v1.1 headline: Candidate report (approved)

Every competitor treats the candidate as the object being screened. We make
them a participant — the natural extension of the portal we already shipped:

- Recruiter generates a **candidate report link** on the run page (same
  token machinery as share links + portal links).
- The candidate opens `/portal/report/[token]` with no account and sees:
  their overall score band, per-criterion scores **with the quoted evidence**
  (identity-blind wording), and what the rubric values — but never other
  candidates' data, contact info, or files.
- Fully revocable, one-shot optional, hash-chain audited, and off by default
  (recruiter chooses per candidate).

This flips "AI rejected me silently" — the #1 complaint about every tool in
this matrix — into a brand asset. No competitor offers it.

## What we adopt next (v1.1–v1.2), in order

1. **Candidate report** (above) — v1.1 headline.
2. **Skill-graph adjacency** (from CVViz's sourcing angle): "candidates like
   this one" from rubric-overlap similarity — we already have pgvector.
3. **Analytics dashboards** (Resume Worded's "watch your score climb",
   recruiter-side): funnel view of uploaded → scored → reviewed → decided,
   per job and over time.
4. **Scheduled audits** (compliance teams' recurring need): monthly bias-audit
   snapshot to the audit log.
5. **ATS integrations** (CVViz's moat, our v1.2): Greenhouse/Lever/Ashby pull
   APIs — research spike first.
6. **AI-content detection** (Naukri360's angle): flag likely-generated
   resumes as a *signal*, never an auto-reject.

## What we deliberately never build

- **Resume builders / templates / LinkedIn tools** — candidate-side commodity
  features with the fiercest competition and no connection to our moat.
- **Auto-apply / job boards** — off-mission; also a compliance minefield.
- **Per-resume pricing** — honesty of "free and open source" is the wedge
  against $0.07/resume and $23.95/mo incumbents.
- **Fake social proof** — no "as seen on" logos until real press exists.
