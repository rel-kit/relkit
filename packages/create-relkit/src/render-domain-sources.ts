import { sourceImport, sourceModule, type DomainArtifact } from "./domain-planning.js";

/**
 * Binding and export form of a source artifact referenced by a renderer.
 */
type ArtifactReference = {
  readonly binding: string;
  readonly exportKind?: "default" | "named" | undefined;
};

/**
 * Renders function Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param relationships - Rendered descriptor relationship fields included in the function.
 * @returns Function descriptor source with schemas, a handler and optional artifact relationships.
 */
export function functionSource(
  artifact: DomainArtifact,
  relationships: { readonly error?: DomainArtifact; readonly event?: DomainArtifact } = {},
): string {
  const imports = [
    `import { defineFunction } from "@relkit/app/functions";`,
    `import { z } from "@relkit/app/schema";`,
    ...(relationships.error
      ? [
          sourceImport(
            relationships.error.binding,
            sourceModule(relationships.error.path),
            relationships.error.exportKind,
          ),
        ]
      : []),
  ];
  return `${imports.join("\n")}\n\nconst ${artifact.binding} = defineFunction({
  id: "${artifact.id}",
  input: z.object({ value: z.string().default("example") }),
  output: z.object({ value: z.string() }),${relationships.error ? `\n  errors: [${relationships.error.binding}],` : ""}${relationships.event ? `\n  publishes: ["${relationships.event.id}"],` : ""}
  handler: async ({ value }, context) => {${relationships.error ? `\n    if (value === "error") return ${relationships.error.binding}.create({ message: "Example failure" });` : ""}${relationships.event ? `\n    await context.events["${relationships.event.id}"].publish({ value });` : ""}
    return { value };
  },
});

export default ${artifact.binding};
`;
}

/**
 * Renders error Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @returns Typed error descriptor source for the normalized artifact identity.
 */
export function errorSource(artifact: DomainArtifact): string {
  return `import { defineError } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

const ${artifact.binding} = defineError({
  id: "${artifact.id}",
  data: z.object({ message: z.string() }),
  message: ({ message }) => message,
  retry: "never",
});

export default ${artifact.binding};
`;
}

/**
 * Renders event Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param profile - Selected provider profile.
 * @returns Event descriptor source with its schema and optional provider profile.
 */
export function eventSource(artifact: DomainArtifact, profile?: string): string {
  return `import { defineEvent } from "@relkit/app/events";
import { z } from "@relkit/app/schema";

const ${artifact.binding} = defineEvent({
  id: "${artifact.id}",
  version: 1,
  input: z.object({ value: z.string() }),${profile ? `\n  profile: "${profile}",` : ""}
});

declare global {
  namespace Relkit {
    interface EventRegistry {
      readonly "${artifact.id}": typeof ${artifact.binding};
    }
  }
}

export default ${artifact.binding};
`;
}

/**
 * Renders event Function Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param eventId - Descriptor ID of the subscribed event.
 * @param delivery - Requested event delivery guarantee.
 * @param profile - Selected provider profile.
 * @returns Event-function descriptor source targeting the declared event and delivery guarantee.
 */
export function eventFunctionSource(
  artifact: DomainArtifact,
  eventId: string,
  delivery: "transient" | "durable",
  profile?: string,
): string {
  return `import { defineEventFunction } from "@relkit/app/events";

const ${artifact.binding} = defineEventFunction({
  id: "${artifact.id}",
  event: "${eventId}",
  delivery: "${delivery}",${profile ? `\n  profile: "${profile}",` : ""}
  handler: async ({ value }, context) => {
    context.log.info("${artifact.name.fileStem}", { value });
  },
});

export default ${artifact.binding};
`;
}

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
 * Renders prompt Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param text - Declared prompt text entries.
 * @returns Prompt descriptor source preserving the declared text entries.
 */
export function promptSource(artifact: DomainArtifact, text: readonly string[]): string {
  return `import { definePrompt } from "@relkit/app";\n\nconst ${artifact.binding} = definePrompt(${JSON.stringify(text.length === 1 ? text[0] : text, null, 2)}, { id: "${artifact.id}" });\n\nexport default ${artifact.binding};\n`;
}

/**
 * Renders constants Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @returns Constants descriptor source with its stable ID and replaceable example value.
 */
export function constantsSource(artifact: DomainArtifact): string {
  return `import { defineConstants } from "@relkit/app";\n\nconst ${artifact.binding} = defineConstants({ "${artifact.id}": "replace-me" }, { id: "${artifact.id}" });\n\nexport default ${artifact.binding};\n`;
}

/**
 * Uppercases the initial character of a nonempty identifier.
 * @param value - Nonempty identifier produced by name normalization.
 * @returns The identifier with its first character capitalized.
 */
function capitalize(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
