export type { EmbeddingModel } from "ai";
export {
  AuditChain,
  type AuditRecord,
  GENESIS,
  hashLink,
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
  ExtractionError,
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
export {
  buildInterviewKit,
  type EvidenceSpan,
  type InterviewKit,
  type KitCriterion,
  renderKitHtml,
} from "./interview/kit.js";
export {
  createMockModel,
  DEFAULT_REGISTRY,
  type GenerationRequest,
  generateStructured,
  type LanguageModel,
  modelIdOf,
  type ProviderConfig,
  promptHash,
  resolveLanguageModel,
  SchemaViolationError,
  type StructuredResult,
} from "./llm/index.js";
export { ParseError, parseCandidate } from "./parse/candidate.js";
export {
  type Candidate,
  type CandidateEducation,
  type CandidateWork,
  candidateSchema,
} from "./parse/schema.js";
export {
  deriveRubric,
  MAX_JD_CHARS,
  slugifyKey,
} from "./rubric/derive.js";
export type { AnchoredLevel, Criterion, Rubric } from "./rubric/schema.js";
export {
  diffRubrics,
  forkRubric,
  parseRubric,
  serializeRubric,
} from "./rubric/versioning.js";
export {
  type BiasAudit,
  biasAudit,
  type GroupAuditRow,
  type GroupOutcome,
  selectionRate,
} from "./score/bias.js";
export {
  MAX_RESUME_CHARS,
  type ScoredCriterion,
  type ScoreRunOptions,
  scoreResume,
} from "./score/engine.js";
export { percentileRank, poolMean } from "./score/pool.js";
export { type CriterionScore, weightedOverall } from "./score/weighting.js";
export {
  type AskResult,
  CHUNK_OVERLAP_CHARS,
  CHUNK_TARGET_CHARS,
  chunkText,
  createEmbeddingModel,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  embedChunkTexts,
  embedQuery,
  type SearchHit,
  synthesizeAnswer,
  type TextChunk,
} from "./search/index.js";
export {
  expandZip,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_TOTAL_BYTES,
  sanitizeEntryName,
  type ZipEntry,
} from "./zip/expand.js";
