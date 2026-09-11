// Design system (Phase 9): shadcn-based components, OKLCH tokens,
// motion primitives, theme helpers.
export { cn } from "./cn";
export {
  Button,
  type ButtonProps,
  buttonVariants,
} from "./components/button";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/card";
export {
  OverallScore,
  ScoreBadge,
  type ScoreBadgeProps,
  type ScoreLevel,
} from "./components/score-badge";
export { FadeIn, Stagger } from "./motion/primitives";
export {
  applyTheme,
  initTheme,
  resolveTheme,
  setTheme,
  storedTheme,
  systemTheme,
  type Theme,
} from "./theme/theme";

/** Version marker retained from the placeholder module. */
export const UI_PACKAGE_VERSION = "0.1.0";
