/** Reads the integration catalog that release synchronization bundles into this package's manifest. */
import manifest from "../package.json";
import type { BundledIntegration } from "./integration-catalog.types.js";
export type { BundledIntegration } from "./integration-catalog.types.js";

/**
 * Lists every RelKit integration package released with this creator.
 * @returns Integrations sorted by id, with their package name and maturity tier.
 */
export function bundledIntegrations(): readonly BundledIntegration[] {
  const metadata: unknown = (manifest as { relkit?: { integrations?: unknown } }).relkit
    ?.integrations;
  if (!Array.isArray(metadata)) throw new TypeError("The bundled integration catalog is missing.");
  return metadata.map((entry: unknown) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !("id" in entry) ||
      !("package" in entry) ||
      !("maturity" in entry) ||
      typeof entry.id !== "string" ||
      typeof entry.package !== "string" ||
      (entry.maturity !== "core" && entry.maturity !== "labs")
    )
      throw new TypeError("The bundled integration catalog has an invalid entry.");
    return { id: entry.id, package: entry.package, maturity: entry.maturity };
  });
}

/**
 * Finds the bundled catalog entry of one integration package.
 * @param packageName - Published package name, such as `@relkit/redis`.
 * @returns The entry, or undefined when the package is not a released integration.
 */
export function bundledIntegration(packageName: string): BundledIntegration | undefined {
  return bundledIntegrations().find((entry) => entry.package === packageName);
}
