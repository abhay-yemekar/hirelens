import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Contributing — HireLens",
  description:
    "How to contribute to HireLens: GitHub Flow, Conventional Commits, the PR checklist, and what makes a PR merge fast.",
};

export default function ContributingPage() {
  return (
    <ProsePage
      eyebrow="Project"
      title="Contributing"
      lede="Contributions are welcome — code, docs, rubrics, and bug reports alike. The workflow is GitHub Flow, enforced by CI and git hooks."
    >
      <h2>The workflow</h2>
      <ol>
        <li>
          Branch off <code>main</code>: <code>feat/&lt;slug&gt;</code>,{" "}
          <code>fix/&lt;slug&gt;</code>, <code>docs/&lt;slug&gt;</code>… Never commit directly to
          main — not even for a typo.
        </li>
        <li>
          Commit with <a href="https://www.conventionalcommits.org">Conventional Commits</a> —{" "}
          <code>feat:</code>, <code>fix:</code>, <code>chore:</code>, <code>docs:</code>… commitlint
          enforces this at commit time.
        </li>
        <li>Push early, open a draft PR, let CI run against real work.</li>
        <li>All checks green: lint (Biome), typecheck, tests, build. A red check never merges.</li>
        <li>
          Self-review your diff in the GitHub UI before requesting review — hunt for leftover
          console.log, secrets, dead code, unlinked TODOs.
        </li>
        <li>Squash-merge; the commit message becomes the changelog entry. Delete the branch.</li>
      </ol>

      <h2>Definition of Done</h2>
      <ul>
        <li>Unit tests for new core logic; Zod validation at every new trust boundary.</li>
        <li>Loading, empty, and error states designed — not just the happy path.</li>
        <li>
          Keyboard accessible; respects <code>prefers-reduced-motion</code>; works in dark and
          light.
        </li>
        <li>
          Docs updated if behavior changed. No <code>any</code> without justification.
        </li>
      </ul>

      <h2>Good first contributions</h2>
      <ul>
        <li>
          <strong>Rubrics.</strong> Curated rubric JSON for new roles is a huge lever — see the
          rubric schema in <code>packages/core</code>.
        </li>
        <li>
          <strong>Troubleshooting entries.</strong> Hit an error not on the{" "}
          <a href="/troubleshooting">troubleshooting page</a>? Document it.
        </li>
        <li>
          <strong>Eval cases.</strong> The benchmark grows more meaningful with every realistic
          synthetic resume added.
        </li>
        <li>
          <strong>Docs.</strong> If a quickstart step confused you, the next person too — PR the
          fix.
        </li>
      </ul>

      <h2>Before you start</h2>
      <p>
        Dev setup lives in the <a href="/docs/quickstart">quickstart</a>. Read the full{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/blob/main/CONTRIBUTING.md">
          CONTRIBUTING.md
        </a>{" "}
        and the{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/blob/main/CODE_OF_CONDUCT.md">
          Code of Conduct
        </a>{" "}
        — both are short, and both are enforced.
      </p>
    </ProsePage>
  );
}
