import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.RELKIT_INSPECTOR_DIST_DIR ?? ".next",
  generateBuildId: async () => "relkit",
  output: "standalone",
};

export default nextConfig;
