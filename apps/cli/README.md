# hirelens (CLI)

Command-line companion for [HireLens](https://github.com/abhay-yemekar/hirelens) — the open-source, self-hostable AI resume screener that shows its evidence.

Drive HireLens from any pipeline: create jobs, derive rubrics from a job description with an LLM, upload resume folders, score them, and print a ranked table — without opening the browser.

## Install

```bash
npx hirelens --help
```

Requires Node ≥ 20. Zero runtime dependencies.

## Configuration

The CLI talks to a HireLens server (the one you self-host with `docker compose up`, or your deployment):

| Environment | Purpose | Default |
|---|---|---|
| `HIRELENS_API_URL` | Server base URL | `http://localhost:4000` |
| `HIRELENS_CONFIG_DIR` | Where the session config is stored | `~/.hirelens` |

`hirelens login` stores your session in `~/.hirelens/config.json` (override the directory with `HIRELENS_CONFIG_DIR`).

## Commands

```
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
      --breakdown                          Also print per-criterion details
      --json                               Machine-readable ranked output
hirelens version                           Print the version
```

Environment: `HIRELENS_API_URL`, `HIRELENS_COOKIE`, `HIRELENS_PASSWORD`, `HIRELENS_CONFIG_DIR`.

## Example

```bash
hirelens login recruiter@corp.com
hirelens jobs create "Backend Engineer" --jd ./jd.md
hirelens rubric derive <jobId>
hirelens score <jobId> ./resumes/
```

`score` prints a ranked table (rank · candidate · overall · stage) suitable for piping into other tools.

## License

MIT — see [LICENSE](https://github.com/abhay-yemekar/hirelens/blob/main/LICENSE).
