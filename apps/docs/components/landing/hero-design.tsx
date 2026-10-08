"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";
import * as motion from "motion/react-m";

const loadFeatures = () => import("./motion-features").then((module) => module.default);

export function HeroDesign({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        <motion.section className={`hero-design ${className}`}>{children}</motion.section>
      </LazyMotion>
    </MotionConfig>
  );
}
