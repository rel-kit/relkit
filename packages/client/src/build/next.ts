import type { NextConfig } from "./next.types.js";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readPublicFingerprint } from "./manifest.js";

/**
 * Adds the generated public fingerprint and linked-workspace root to Next configuration.
 * @param config - Existing framework configuration.
 * @param options - Existing public configuration and authority.
 * @returns Next configuration with the generated fingerprint and workspace root.
 */
export function withRelkit(
  config: NextConfig = {},
  options: { readonly root?: string } = {},
): NextConfig {
  const linkedRoot =
    config.turbopack?.root === undefined
      ? linkedClientRoot(resolve(options.root ?? process.cwd()))
      : undefined;
  return {
    ...config,
    ...(linkedRoot === undefined ? {} : { turbopack: { ...config.turbopack, root: linkedRoot } }),
    env: {
      ...config.env,
      NEXT_PUBLIC_RELKIT_PUBLIC_FINGERPRINT: readPublicFingerprint(options.root),
    },
  };
}

/**
 * Finds a shared workspace root only when a linked client lies outside the application.
 * @param root - Existing root used for lookup or configuration.
 * @returns The shared linked workspace root, or undefined when unnecessary.
 */
function linkedClientRoot(root: string): string | undefined {
  const client = join(root, "node_modules/@relkit/client");
  if (!existsSync(client)) return undefined;
  const project = realpathSync(root);
  const target = realpathSync(client);
  if (!outside(project, target)) return undefined;
  let shared = project;
  while (outside(shared, target)) {
    const parent = dirname(shared);
    if (parent === shared) return undefined;
    shared = parent;
  }
  return shared;
}

/**
 * Checks whether a resolved target lies outside the supplied root.
 * @param root - Existing root used for lookup or configuration.
 * @param target - Resolved target path.
 * @returns Whether the target lies outside the root.
 */
function outside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}
