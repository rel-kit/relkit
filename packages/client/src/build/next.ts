import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readPublicFingerprint } from "./manifest.js";

type NextConfig = Readonly<Record<string, unknown>> & {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly turbopack?: Readonly<Record<string, unknown>> & { readonly root?: string };
};

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

function outside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}
