export {
  AuditChain,
  type AuditRecord,
  GENESIS,
} from "./audit/hashChain.js";
export {
  contentHash,
  type DuplicateMatch,
  findDuplicates,
  jaro,
  NAME_SIMILARITY_THRESHOLD,
  normalizeEmail,
  normalizeName,
  textHash,
} from "./dedupe/index.js";
export { locateEvidenceSpan, type TextSpan } from "./evidence/textSpan.js";
export {
  type ExtractedDocument,
  type ExtractedKind,
  extractDocument,
  extractDocx,
  extractPdf,
  extractTextFile,
  isSupportedExtension,
  type LayoutHints,
  MAX_DOCUMENT_BYTES,
  SUPPORTED_EXTENSIONS,
  sniffKind,
} from "./extract/index.js";
export { ParseError, parseCandidate } from "./parse/candidate.js";
export {
  type Candidate,
  type CandidateEducation,
  type CandidateWork,
  candidateSchema,
} from "./parse/schema.js";
export { type CriterionScore, weightedOverall } from "./score/weighting.js";
export {
  expandZip,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_TOTAL_BYTES,
  sanitizeEntryName,
  type ZipEntry,
} from "./zip/expand.js";
