/** Lists the native SDKs each jobs provider loads at check, build and run time. */

import { buildCatalogDependency } from "./build-catalog.js";
import type { CreateJobs } from "./options.js";

/** `@relkit/trigger` pins its SDK directly rather than through the shared catalog. */
const TRIGGER_SDK_VERSION = "4.7.2";

/**
 * Resolves the provider's native SDK dependencies at the versions its integration supports.
 * @param jobs - Selected jobs provider.
 * @returns Package name and exact version pairs to add to the generated manifest.
 */
export function jobsNativeDependencies(jobs: CreateJobs): Readonly<Record<string, string>> {
  switch (jobs) {
    case "inngest-docker":
      return { inngest: buildCatalogDependency("inngest") };
    case "effect-mq-docker":
      return {
        "effect-mq": buildCatalogDependency("effect-mq"),
        "drizzle-orm": buildCatalogDependency("drizzle-orm"),
      };
    case "trigger-docker":
      return { "@trigger.dev/sdk": TRIGGER_SDK_VERSION };
  }
}
