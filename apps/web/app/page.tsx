import type { JSX } from "react";

export default function Home(): JSX.Element {
  return (
    <main
      style={{ fontFamily: "system-ui", maxWidth: 760, margin: "4rem auto", padding: "0 1.5rem" }}
    >
      <h1>HireLens</h1>
      <p style={{ fontSize: "1.25rem" }}>
        <strong>See why, not just who.</strong> The open-source, glass-box hiring intelligence
        platform.
      </p>
      <p>
        Rank candidates against a job with evidence-linked scores, rubric transparency, and built-in
        bias auditing. Under active development - this site is the future home of the product UI.
      </p>
      <ul>
        <li>Rubric-based scoring with anchored 0-5 scales</li>
        <li>Evidence spans linking every score to the resume text</li>
        <li>Bias audit reporting (four-fifths rule)</li>
        <li>Local-first: bring your own model or run on Ollama</li>
      </ul>
    </main>
  );
}
