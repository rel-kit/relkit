/** Allows finite repository-tooling reuse at the docs build boundary; site components and runtime handlers retain normal package ownership checks. */
const consumerHelpers = new Set([
  "scripts/consumer-artifacts.js",
  "scripts/consumer-registry.js",
  "scripts/consumer-installation.js",
  "scripts/consumer-installation-native.js",
  "scripts/scaffold-process.js",
  "scripts/scaffold-http.js",
]);

/** Recognizes only the approved metadata leaf or existing packed-consumer infrastructure.
 * @param source - Importing path relative to the repository root.
 * @param target - Resolved foreign path relative to that same root.
 * @returns Whether this explicit build/test edge bypasses the relative-import prohibition.
 */
export function isDocumentationBuildImport(source: string, target: string): boolean {
  if (source === "apps/docs/scripts/public-api-manifests.ts")
    return target === "scripts/workspace-packages.js";
  if (source === "apps/docs/scripts/installation-catalog.ts")
    return target === "packages/runtime-hono/src/selected-transports.js";
  const consumer =
    source === "apps/docs/scripts/check-installation-workflows.ts" ||
    /^apps\/docs\/scripts\/installation-workflow-[a-z-]+\.ts$/.test(source);
  return consumer && consumerHelpers.has(target);
}
