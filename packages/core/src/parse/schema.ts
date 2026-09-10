import { z } from "zod";

/**
 * Structured candidate profile, JSON Resume compatible.
 *
 * Field names and shapes intentionally mirror the JSON Resume
 * standard (jsonresume.org) so exports interoperate. Fields we do
 * not support yet are omitted entirely rather than stubbed.
 */
export const workSchema = z.object({
  /** Company or employer name. */
  name: z.string().min(1),
  /** Job title. */
  position: z.string().min(1).optional(),
  /** ISO date "YYYY-MM-DD" or "YYYY-MM". */
  startDate: z.string().min(4).optional(),
  endDate: z.string().min(4).optional(),
  /** True when this role is the candidate's current one. */
  current: z.boolean().optional(),
  /** 1-3 sentence summary of the role. */
  summary: z.string().optional(),
});

export const educationSchema = z.object({
  institution: z.string().min(1),
  /** Degree, field, or program name. */
  studyType: z.string().optional(),
  area: z.string().optional(),
  startDate: z.string().min(4).optional(),
  endDate: z.string().min(4).optional(),
  /** GPA, honors, or other notes. */
  score: z.string().optional(),
});

export const candidateSchema = z.object({
  /** Display name, or null when not confidently detected. */
  name: z.string().min(1).nullable(),
  /** Primary email or null. */
  email: z.string().email().nullable(),
  /** Primary phone or null. */
  phone: z.string().min(7).nullable(),
  /** Primary location string or null. */
  location: z.string().nullable(),
  /** Personal site / portfolio URL or null. */
  website: z.string().url().nullable(),
  /** Profile handles: github, linkedin, etc. */
  profiles: z.array(
    z.object({
      network: z.string().min(1),
      username: z.string().min(1),
      url: z.string().url().optional(),
    }),
  ),
  summary: z.string().nullable(),
  work: z.array(workSchema),
  education: z.array(educationSchema),
  /** Free-form skill names, order of appearance. */
  skills: z.array(z.string().min(1)),
  /** Certifications: "Name (Issuer, Year)" or plain name. */
  certifications: z.array(z.string().min(1)),
  /** ISO 639-1 code detected for the resume body. */
  language: z.string().length(2),
  /** BCP-47 tags for the detected language. */
  languageTag: z.string().min(2),
});

export type CandidateWork = z.infer<typeof workSchema>;
export type CandidateEducation = z.infer<typeof educationSchema>;

export type Candidate = z.infer<typeof candidateSchema>;

/** Errors thrown by the heuristic parser. */ export type ParseErrorCode =
  | "EMPTY_TEXT"
  | "LOW_INFORMATION";

export class ParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ParseError";
    this.code = code;
  }
}
