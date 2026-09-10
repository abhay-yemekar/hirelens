"use client";

import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

/**
 * Motion primitives (plan §8.1): 150-250ms, spring easing, interruptible,
 * reduced-motion honored at the component level as well as globally in
 * tokens.css.
 */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered children: wrap list items, each fades in 40ms after the last. */
export function Stagger({
  children,
  className,
  interval = 0.04,
}: {
  children: React.ReactNode;
  className?: string;
  interval?: number;
}) {
  const reduce = useReducedMotion();
  const items = React.Children.toArray(children);
  return (
    <div className={className}>
      {items.map((child, i) => (
        <motion.div
          key={i}
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 300, damping: 30, delay: i * interval }
          }
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
