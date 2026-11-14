/**
 * Rejects local-only provider bindings in a production build, at the binding's own entry in the
 * configuration, with what to write instead.
 */
import { Effect } from "effect";
import { createDiagnostic } from "relkit/diagnostics";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { providerMaps } from "./normalize-graph-app.js";
import { providerEntryLocation } from "./normalize-source-keys.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

/**
 * Checks provider release source ownership.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateProviderReleaseSourcesEffect = Effect.fn(
  "Compiler.validateProviderReleaseSources",
)(
  function* (work: NormalizationWork) {
    if (work.input.mode !== "production") return;
    for (const descriptor of work.descriptors.filter((entry) => entry.kind === "app")) {
      const application = isRecord(descriptor.value) ? descriptor.value : {};
      for (const [capability, profiles] of providerMaps(application)) {
        if (!isRecord(profiles)) continue;
        for (const [profile, candidate] of Object.entries(profiles)) {
          if (
            !isRecord(candidate) ||
            !isRecord(candidate.source) ||
            candidate.source.kind !== "local-only"
          )
            continue;
          const bindingId = `provider.${capability}.${profile}`;
          const location =
            providerEntryLocation(
              work.input.sources ?? [],
              descriptor.source.file,
              capability,
              profile,
            ) ?? descriptor.source;
          work.diagnostics.push(
            createDiagnostic({
              code: NORMALIZE_CODES.providerReleaseSource,
              severity: "error",
              message: `Provider binding "${bindingId}" is local-only, so a release build has no source for it.`,
              descriptorId: descriptor.id,
              location,
              suggestion: releaseSourceSuggestion(capability),
            }),
          );
        }
      }
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "validateProviderReleaseSources", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Says what to write for a local-only binding, in the words of the local Docker guide.
 * @param capability - Provider capability of the binding.
 * @returns A connected adapter with binding values, or an infrastructure source.
 */
function releaseSourceSuggestion(capability: string): string {
  const adapter =
    capability === "bucket"
      ? 's3({ endpoint: env.url("S3_ENDPOINT"), bucketName: env.string("S3_BUCKET"), … })'
      : ["cache", "realtime", "agent-state"].includes(capability)
        ? 'redis({ url: env.secret("REDIS_URL") })'
        : "adapter({ …binding values })";
  return `Configure the adapter inside docker(…) with its binding values, for example docker(${adapter}) with env from "relkit/config", so release builds resolve them; or select an infrastructure source, such as aws(…) from "@relkit/aws".`;
}

/**
 * Checks provider release source ownership.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateProviderReleaseSources(work: NormalizationWork): void {
  return runCompilerSync(validateProviderReleaseSourcesEffect(work));
}
