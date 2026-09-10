import { resolve } from "node:path";
import type { NextConfig } from "next";
import { withRelkit } from "@relkit/client/build/next";

export default withRelkit(
  {
    output: "standalone",
    distDir: process.env.RELKIT_NEXT_DIST_DIR ?? ".next",
  } satisfies NextConfig,
  { root: resolve(process.cwd(), "../commerce") },
);
