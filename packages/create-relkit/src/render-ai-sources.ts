import { sourceImport, type DomainArtifact } from "./domain-planning.js";

/**
 * Binding and export form of a source artifact referenced by a renderer.
 */
type ArtifactReference = {
  readonly binding: string;
  readonly exportKind?: "default" | "named" | undefined;
};

/**
 * Renders tool Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param target - Discovered domain or artifact target.
 * @param targetModule - Source module specifier of the referenced callable or task.
 * @param sideEffect - Side-effect category declared by the generated tool.
 * @param approval - Approval policy declared by the generated tool.
 * @returns TypeScript declaring a tool wrapper for the target callable with the selected effect/approval policy.
 */
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

/**
 * Renders agent Source as source text without executing user modules.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param model - Selected model profile/ID, or undefined for the deterministic offline model.
 * @param tools - Resolved tool bindings, module paths and export forms.
 * @param instructions - Inline instruction text or resolved prompt import metadata.
 * @returns TypeScript declaring the agent, resolved tools/instructions and selected or offline model.
 */
export function agentSource(
  artifact: DomainArtifact,
  model: string | undefined,
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
    ...(model === undefined ? [`import { FakeToolCallingModel } from "langchain";`] : []),
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
  model: ${model === undefined ? offlineModel() : JSON.stringify(model)},
  instructions: ${prompt},
  tools: [${tools.map((tool) => tool.binding).join(", ")}],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});

export default ${artifact.binding};
`;
}

/**
 * Renders offline Model as source text without executing user modules.
 * @returns A deterministic FakeToolCallingModel constructor expression for generated offline examples.
 */
function offlineModel(): string {
  return `new FakeToolCallingModel({
    toolCalls: [[{
      name: "relkit_output",
      args: { value: { answer: "Hello from the offline LangChain model." } },
      id: "output-1",
    }]],
  })`;
}
