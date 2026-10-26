/** Renders native task and job source from declaration-only scaffold facts. */

import { sourceImport, type DomainArtifact } from "./domain-planning.js";
/** Binding and export form of a source artifact referenced by a renderer. */
type ArtifactReference = {
  readonly binding: string;
  readonly exportKind?: "default" | "named" | undefined;
};

/**
 * Renders job Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param target - Discovered domain or artifact target.
 * @param targetModule - Source module specifier of the referenced callable or task.
 * @param profile - Selected provider profile.
 * @returns Legacy function-targeted job descriptor source with optional provider selection.
 */
export function jobSource(
  artifact: DomainArtifact,
  target: ArtifactReference,
  targetModule: string,
  profile?: string,
): string {
  return `import { defineJob } from "@relkit/app/jobs/legacy";
${sourceImport(target.binding, targetModule, target.exportKind)}
const ${artifact.binding} = defineJob({
  id: "${artifact.id}",
  input: ${target.binding}.input,
  target: ${target.binding},${profile ? `\n  profile: "${profile}",` : ""}
  retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
});
export default ${artifact.binding};
`;
}
/**
 * Renders task Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param version - Task version included in the generated descriptor.
 * @param execution - Task execution guarantee required by the job provider.
 * @returns Task descriptor source with its version, execution guarantee and schemas.
 */
export function taskSource(
  artifact: DomainArtifact,
  version: string,
  execution: "durable" | "retryable",
): string {
  return `import { defineTask } from "@relkit/app/tasks";
import { z } from "@relkit/app/schema";
const ${artifact.binding} = defineTask({
  id: "${artifact.id}",
  version: "${version}",
  execution: "${execution}",
  input: z.object({ value: z.string() }),
  output: z.object({ accepted: z.literal(true) }),
  handler: async ({ value }, context) => {
    context.log.info("${artifact.name.fileStem} task", { value });
    return { accepted: true as const };
  },
});
export default ${artifact.binding};
`;
}
/**
 * Renders task Job Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param target - Discovered domain or artifact target.
 * @param targetModule - Source module specifier of the referenced callable or task.
 * @param profile - Selected provider profile.
 * @param domain - Normalized owning domain used by source imports and job names.
 * @returns Task-targeted job descriptor source with optional provider and domain-specific name.
 */
export function taskJobSource(
  artifact: DomainArtifact,
  target: ArtifactReference,
  targetModule: string,
  profile?: string,
  domain?: string,
): string {
  const name =
    domain === undefined
      ? artifact.name.identifier
      : `${domain}${capitalize(artifact.name.identifier)}`;
  return `import { defineJob } from "@relkit/app/jobs";
${sourceImport(target.binding, targetModule, target.exportKind)}
const ${artifact.binding} = defineJob({
  id: "${artifact.id}",
  name: "${name}",
  task: ${target.binding},${profile ? `\n  service: "${profile}",` : ""}
});
export default ${artifact.binding};
`;
}

/**
 * Uppercases the initial character of a nonempty identifier.
 * @param value - Nonempty identifier produced by name normalization.
 * @returns The identifier with its first character capitalized.
 */
function capitalize(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
