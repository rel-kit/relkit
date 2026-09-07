import { sourceImport, type DomainArtifact } from "./domain-planning.js";

type ArtifactReference = {
  readonly binding: string;
  readonly exportKind?: "default" | "named" | undefined;
};

export function toolSource(
  artifact: DomainArtifact,
  target: ArtifactReference,
  targetModule: string,
  sideEffect: "none" | "read" | "write" | "external",
  approval: "never" | "on-write" | "always",
): string {
  return `${sourceImport(target.binding, targetModule, target.exportKind)}

const ${artifact.binding} = ${target.binding}.asTool({
  id: "${artifact.id}",
  description: "${artifact.name.input}",
  sideEffect: "${sideEffect}",
  approval: "${approval}",
  timeoutMs: 2_000,
});

export default ${artifact.binding};
`;
}

export function agentSource(
  artifact: DomainArtifact,
  model: string,
  tools: readonly {
    readonly binding: string;
    readonly module: string;
    readonly exportKind?: "default" | "named" | undefined;
  }[],
  instructions: {
    readonly text?: string;
    readonly binding?: string;
    readonly module?: string;
    readonly exportKind?: "default" | "named" | undefined;
  },
): string {
  const imports = [
    `import { defineAgent } from "@relkit/app/agents";`,
    `import { z } from "@relkit/app/schema";`,
    ...tools.map((tool) => sourceImport(tool.binding, tool.module, tool.exportKind)),
    ...(instructions.binding && instructions.module
      ? [sourceImport(instructions.binding, instructions.module, instructions.exportKind)]
      : []),
  ];
  const prompt = instructions.binding ?? JSON.stringify(instructions.text);
  return `${imports.join("\n")}\n\nconst ${artifact.binding} = defineAgent({
  id: "${artifact.id}",
  input: z.object({ question: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  model: "${model}",
  instructions: ${prompt},
  tools: [${tools.map((tool) => tool.binding).join(", ")}],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});

export default ${artifact.binding};
`;
}
