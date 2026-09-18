/**
 * Storage key → the filename the user uploaded ("resumes/ab1/John_Doe.pdf"
 * → "John Doe"). Human candidate labels come from the file the recruiter
 * dropped in — never from parsed resume content. The extension is stripped
 * and underscores/hyphens become spaces, so the UI shows a person's name,
 * not a filename.
 */
export function labelFromFileKey(key: string | null): string | null {
  if (!key) return null;
  const last = key.split("/").pop();
  if (!last) return null;
  const withoutExt = last.replace(/\.[a-z0-9]+$/i, "");
  const pretty = withoutExt.replace(/[_-]+/g, " ").trim();
  return pretty || last;
}
