import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ZSYS_INSPECTOR_DIST_DIR ?? ".next",
  output: "standalone",
};

export default nextConfig;
