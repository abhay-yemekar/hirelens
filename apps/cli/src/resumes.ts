/**
 * Resume files for `hirelens score`: which types the CLI uploads, and how
 * a directory argument is scanned. Extensions match in any letter case
 * (`resume.PDF` is a PDF).
 */

import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fail } from "./errors.ts";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

export interface ResumeFile {
  name: string;
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** The upload type for a resume path, or undefined when the CLI doesn't take that file type. */
export function mimeFor(path: string): string | undefined {
  return MIME[extname(path).toLowerCase()];
}

export async function loadResume(path: string): Promise<ResumeFile> {
  const mime = mimeFor(path);
  if (!mime) {
    fail(`unsupported resume type "${extname(path)}" (pdf, docx, txt, md) — ${path}`);
  }
  const buffer = await readFile(path);
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return { name: basename(path), mime, bytes };
}

/**
 * Files named directly are loaded as given (an unsupported one is an
 * error). A directory contributes its supported, non-hidden files and
 * skips everything else; it is not searched recursively.
 */
export async function collectResumes(paths: string[]): Promise<ResumeFile[]> {
  const out: ResumeFile[] = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const entry of readdirSync(p)) {
        if (entry.startsWith(".")) continue;
        const full = join(p, entry);
        if (statSync(full).isFile() && mimeFor(entry) !== undefined) {
          out.push(await loadResume(full));
        }
      }
    } else {
      out.push(await loadResume(p));
    }
  }
  return out;
}
