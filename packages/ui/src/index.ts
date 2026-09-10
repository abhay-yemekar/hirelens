// Design system (Phase 9): shadcn-based components, OKLCH tokens,
// motion primitives, theme helpers.
export { cn } from "./cn.js";
export {
  Button,
  type ButtonProps,
  buttonVariants,
} from "./components/button.js";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/card.js";
export {
  OverallScore,
  ScoreBadge,
  type ScoreBadgeProps,
  type ScoreLevel,
} from "./components/score-badge.js";
export { FadeIn, Stagger } from "./motion/primitives.js";
export {
  applyTheme,
  initTheme,
  resolveTheme,
  setTheme,
  storedTheme,
  systemTheme,
  type Theme,
} from "./theme/theme.js";

/** Version marker retained from the placeholder module. */
export const UI_PACKAGE_VERSION = "0.1.0";
