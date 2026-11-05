/**
 * Maps 0.8 package specifiers to their 0.9 home. The 26 authoring and runtime packages and
 * `@relkit/app` merged into `relkit` (each former package is `relkit/<area>`), the tool
 * packages merged into `@relkit/cli`, `@relkit/inspector` and `@relkit/pulumi`, and three
 * packages were removed. `internal/` segments were dropped from every subpath. A unit test
 * keeps this table equal to the packed export maps.
 */
import type { PackageTarget } from "../code-migration.types.js";

/** Former packages that are now `relkit/<area>`. */
const relkitAreas = new Set([
  "agents",
  "buckets",
  "cache",
  "config",
  "contracts",
  "deploy",
  "diagnostics",
  "engine",
  "events",
  "functions",
  "graph",
  "inspector-api",
  "invocation",
  "jobs",
  "local-service",
  "observability",
  "openapi",
  "provider",
  "providers-local",
  "realtime",
  "routes",
  "runtime-effect",
  "runtime-hono",
  "schema",
  "services",
  "tools",
]);

/** Former tool packages and the package subpath that now holds them. */
const toolAreas: Readonly<Record<string, string>> = {
  compiler: "@relkit/cli/compiler",
  "client-generator": "@relkit/cli/client-generator",
  supervisor: "@relkit/cli/supervisor",
  "observability-local": "@relkit/inspector/observability-local",
  "deploy-pulumi": "@relkit/pulumi/engine",
};

/** Removed packages and what replaces them. */
const removed: Readonly<Record<string, string>> = {
  "cloud-aws":
    "@relkit/cloud-aws was folded into @relkit/aws, which deploys with it internally; depend on @relkit/aws.",
  "providers-standard": "@relkit/providers-standard was removed; it exported nothing.",
  integrations: "@relkit/integrations was removed; create-relkit and relkit add carry the catalog.",
};

/**
 * Finds the 0.9 target of a module specifier.
 * @param specifier - Module specifier as written in source or a manifest key.
 * @returns The new specifier and its package, a removal reason, or undefined when unchanged.
 */
export function packageTarget(specifier: string): PackageTarget | undefined {
  // The Bun WebSocket helper moved behind the runtime adapter in 0.9.
  if (/^(?:@relkit|relkit)\/runtime-hono\/bun$/.test(specifier))
    return moved("relkit/runtime/bun", "relkit");
  const match = /^@relkit\/([^/]+)(?:\/(.*))?$/.exec(specifier);
  if (match === null) return undefined;
  const [, name = "", rest] = match;
  const subpath = rest?.replace(/(^|\/)internal(?=\/|$)\/?/g, "$1").replace(/\/$/, "");
  if (name === "app") {
    if (subpath === "jobs/legacy")
      return {
        kind: "removed",
        reason:
          "Legacy function-target jobs were removed; define a task and a task-backed defineJob from relkit/jobs.",
      };
    return moved(subpath ? `relkit/${subpath}` : "relkit", "relkit");
  }
  if (relkitAreas.has(name))
    return moved(subpath ? `relkit/${name}/${subpath}` : `relkit/${name}`, "relkit");
  const tool = toolAreas[name];
  if (tool !== undefined) {
    const packageName = tool.split("/").slice(0, 2).join("/");
    return moved(subpath ? `${tool}/${subpath}` : tool, packageName);
  }
  const reason = removed[name];
  return reason === undefined ? undefined : { kind: "removed", reason };
}

/**
 * Builds a moved target.
 * @param specifier - New module specifier.
 * @param packageName - Package that owns it.
 * @returns The moved target record.
 */
function moved(specifier: string, packageName: string): PackageTarget {
  return { kind: "moved", specifier, packageName };
}

/**
 * Splits a specifier into its package name and export subpath key.
 * @param specifier - Bare module specifier.
 * @returns The package name and the `./subpath` key (`.` for the root).
 */
export function exportKey(specifier: string): { packageName: string; key: string } {
  const parts = specifier.split("/");
  const size = specifier.startsWith("@") ? 2 : 1;
  const rest = parts.slice(size).join("/");
  return { packageName: parts.slice(0, size).join("/"), key: rest === "" ? "." : `./${rest}` };
}
