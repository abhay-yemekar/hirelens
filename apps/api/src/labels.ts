/**
 * Storage key → the filename the user uploaded ("resumes/ab1/John_Doe.pdf"
 * → "John_Doe.pdf"). Human candidate labels come from the file the
 * recruiter dropped in — never from parsed resume content.
 */
export function labelFromFileKey(key: string | null): string | null {
  if (!key) return null;
  const last = key.split("/").pop();
  return last || null;
}
