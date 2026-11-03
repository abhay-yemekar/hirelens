# Security Policy

## Supported versions

| Version                                  | Supported                  |
| ---------------------------------------- | -------------------------- |
| `main` branch (what the hosted app runs) | ✅                         |
| Latest release (currently 1.4.x)         | ✅                         |
| Older releases (1.0.x, 1.2.x)            | ❌ — upgrade to the latest |

Security fixes land on `main` first, then ship in the next release: the npm package `hirelens` and the GHCR images. Fixes are not backported to older releases.

## Reporting a vulnerability

**Do not open a public issue for security reports.**

Email **abhay.s.yemekar@gmail.com** with:

1. A description of the vulnerability and its impact.
2. Step-by-step reproduction instructions (or a PoC).
3. Affected files/lines if known.

You will receive an acknowledgment within **72 hours**. We aim to triage within 7 days and will keep you informed throughout the fix and disclosure process.

Please do not test vulnerabilities against any instance you do not own or operate.

## Scope

In scope: all code in `apps/` and `packages/`, including algorithmic denial-of-service in that code (for example, a pattern or parser that crafted input makes slow). Out of scope: misconfiguration of your own deployment, flooding a running instance with traffic, and social engineering.

## A note on PII

HireLens handles resumes — personal data by definition. If you discover a path where uploaded documents leak (logs, error traces, git, caches), treat it as **critical** and report it immediately. Real resumes must never be committed to this repository; `uploads/` is git-ignored for exactly this reason.
