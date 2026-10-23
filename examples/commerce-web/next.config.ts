/** Keeps the selected commerce frontend build and development compilation within
 * one native worker while retaining the existing RELKIT client build wrapper.
 */
import { resolve } from "node:path";
import type { NextConfig } from "next";
import { withRelkit } from "@relkit/client/build/next";

export default withRelkit(
  {
    output: "standalone",
    distDir: process.env.RELKIT_NEXT_DIST_DIR ?? ".next",
    experimental: { cpus: 1, webpackBuildWorker: true, webpackMemoryOptimizations: true },
  } satisfies NextConfig,
  { root: resolve(process.cwd(), "../commerce") },
);
