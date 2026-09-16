import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Code of Conduct — HireLens",
  description:
    "The HireLens community standard, based on the Contributor Covenant: expected behavior, unacceptable behavior, and enforcement.",
};

export default function CodeOfConductPage() {
  return (
    <ProsePage
      eyebrow="Project"
      title="Code of Conduct"
      lede="Based on the Contributor Covenant 2.1 — the standard governing every interaction in this project's spaces: issues, PRs, discussions, and chat."
    >
      <h2>Our standard</h2>
      <p>
        Examples of behavior that creates a welcoming environment: using welcoming and inclusive
        language, being respectful of differing viewpoints and experiences, accepting constructive
        criticism gracefully, and showing empathy toward other community members.
      </p>

      <h2>Unacceptable behavior</h2>
      <ul>
        <li>Sexualized language or imagery, and unwelcome sexual attention or advances.</li>
        <li>Trolling, insulting or derogatory comments, and personal or political attacks.</li>
        <li>Public or private harassment.</li>
        <li>Publishing others' private information (doxxing) without explicit consent.</li>
        <li>
          Other conduct which could reasonably be considered inappropriate in a professional
          setting.
        </li>
      </ul>

      <h2>Scope</h2>
      <p>
        Applies in project spaces and in public spaces when an individual is representing the
        project or its community.
      </p>

      <h2>Enforcement</h2>
      <p>
        Report violations to the maintainer via{" "}
        <a href="https://www.linkedin.com/in/abhayyemekar/">LinkedIn</a> or a private GitHub
        contact. All complaints are reviewed and handled with discretion. Project maintainers who
        violate the code face the same consequences as anyone else — up to permanent removal from
        the project.
      </p>

      <p>
        The full, authoritative text lives in{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/blob/main/CODE_OF_CONDUCT.md">
          CODE_OF_CONDUCT.md
        </a>{" "}
        in the repository.
      </p>
    </ProsePage>
  );
}
