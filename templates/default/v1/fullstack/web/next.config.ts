import type { NextConfig } from "next";
import { withRelkit } from "@relkit/client/build/next";
import { resolve } from "node:path";

export default withRelkit({} satisfies NextConfig, { root: resolve(process.cwd()) });
