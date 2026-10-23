/** Builds the packaged inspector with one native compilation/static-generation worker. */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.RELKIT_INSPECTOR_DIST_DIR ?? ".next",
  generateBuildId: async () => "relkit",
  output: "standalone",
  experimental: { cpus: 1, webpackBuildWorker: true, webpackMemoryOptimizations: true },
};

export default nextConfig;
