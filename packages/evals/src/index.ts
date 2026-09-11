/** Eval harness (plan §3.1.5): accuracy, self-consistency, position bias, name-swap bias. */
export {
  BENCHMARK_SEED,
  type BenchmarkResume,
  benchmarkResumes,
  benchmarkRubric,
  type Strength,
} from "./benchmark.js";
export { type EvalReport, runEvals } from "./harness.js";
export {
  type AccuracyCase,
  directionAccuracy,
  kendallTau,
  nameSwapBias,
  positionBias,
  type ScoreRecord,
  selfConsistency,
} from "./metrics.js";
