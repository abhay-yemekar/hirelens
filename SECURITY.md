# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` branch | ✅ |
| tagged releases < 1.0.0 | ❌ (pre-release) |

## Reporting a vulnerability

**Do not open a public issue for security reports.**

Email **abhay.s.yemekar@gmail.com** with:

1. A description of the vulnerability and its impact.
2. Step-by-step reproduction instructions (or a PoC).
3. Affected files/lines if known.

You will receive an acknowledgment within **72 hours**. We aim to triage within 7 days and will keep you informed throughout the fix and disclosure process.

Please do not test vulnerabilities against any instance you do not own or operate.

## Scope

In scope: the `backend/` and `frontend/` prototype code, and all `apps/` and `packages/` code as the monorepo lands. Out of scope: your own deployment misconfiguration, denial-of-service, and social engineering.

## A note on PII

HireLens handles resumes — personal data by definition. If you discover a path where uploaded documents leak (logs, error traces, git, caches), treat it as **critical** and report it immediately. Real resumes must never be committed to this repository; `uploads/` is git-ignored for exactly this reason.
