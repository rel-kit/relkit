/**
 * Declares the runtimes each published package supports. Every package runs on Bun; packages that
 * pass on Node LTS also list Node. A package stays Bun-only while its code still calls Bun APIs
 * outside a runtime adapter (see `scripts/portability-baseline.json`).
 */

/** Supported Bun releases. */
export const BUN_ENGINE = ">=1.3.10";

/** Supported Node LTS releases; 22.13 is the first Node 22 with `node:sqlite` unflagged. */
export const NODE_ENGINE = ">=22.13.0";

/** Packages that still need Bun, with the reason. */
export const BUN_ONLY_PACKAGES: Readonly<Record<string, string>> = {
  "@relkit/aws": "the Valkey cache client uses Bun's RedisClient",
  "@relkit/testing": "the in-process test application loads sources with Bun's transpiler",
};

/** Node range of the standalone inspector, whose UI is a Next.js server. */
const INSPECTOR_NODE_ENGINE = ">=20.9.0";

/**
 * Builds a package's `engines` field.
 * @param name - Published package name.
 * @returns Bun and, when supported, Node ranges.
 */
export function packageEngines(name: string): Readonly<Record<string, string>> {
  if (name === "@relkit/inspector") return { bun: BUN_ENGINE, node: INSPECTOR_NODE_ENGINE };
  if (name in BUN_ONLY_PACKAGES) return { bun: BUN_ENGINE };
  return { bun: BUN_ENGINE, node: NODE_ENGINE };
}
