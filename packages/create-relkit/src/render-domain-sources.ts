import { sourceImport, sourceModule, type DomainArtifact } from "./domain-planning.js";

type ArtifactReference = {
  readonly binding: string;
  readonly exportKind?: "default" | "named" | undefined;
};

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

export function jobSource(
  artifact: DomainArtifact,
  target: ArtifactReference,
  targetModule: string,
  profile?: string,
): string {
  return `import { defineJob } from "@relkit/app/jobs";
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

export function promptSource(artifact: DomainArtifact, text: readonly string[]): string {
  return `import { definePrompt } from "@relkit/app";\n\nconst ${artifact.binding} = definePrompt(${JSON.stringify(text.length === 1 ? text[0] : text, null, 2)}, { id: "${artifact.id}" });\n\nexport default ${artifact.binding};\n`;
}

export function constantsSource(artifact: DomainArtifact): string {
  return `import { defineConstants } from "@relkit/app";\n\nconst ${artifact.binding} = defineConstants({ "${artifact.id}": "replace-me" }, { id: "${artifact.id}" });\n\nexport default ${artifact.binding};\n`;
}
