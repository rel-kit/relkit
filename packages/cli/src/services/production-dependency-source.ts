/** Resolves production identities consistently for build and prepared activation. */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import type { DependencySourceContract } from "@relkit/provider/internal/dependencies";

/**
 * Resolves selected packages from consumers, with one fixed framework owner exception.
 * @param source - Captured read-only installed package metadata authority.
 * @param name - Exact production package name.
 * @param root - Actual consuming project root.
 * @returns Native installed identity; SDKs and integrations never use producer fallback.
 */
export const resolveProductionDependency = Effect.fn("Project.productionDependencyIdentity")(
  function* (source: DependencySourceContract, name: string, root: string) {
    const installed = yield* source.resolve(name, root);
    if (installed !== null || name !== "@relkit/runtime-hono") return installed;
    return yield* source.resolve(name, dirname(fileURLToPath(import.meta.url)));
  },
);
