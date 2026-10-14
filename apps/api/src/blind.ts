/**
 * Blind-review masking moved to @hirelens/core (packages/core/src/mask/)
 * so the orchestrator's scoring batch masks the same way the read routes
 * do. Kept as a re-export for existing API imports.
 */
export { blindView } from "@hirelens/core";
