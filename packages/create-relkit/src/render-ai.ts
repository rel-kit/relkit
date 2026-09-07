import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import {
  assertAvailableId,
  domainArtifact,
  resolveArtifact,
  sourceModule,
  type DomainTarget,
} from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { ensureProviderProfile } from "./provider-planning.js";
import { agentSource, toolSource } from "./render-ai-sources.js";
import { renderFunction, type RenderedArtifact } from "./render-domain.js";

export async function renderTool(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "tool" }>,
): Promise<RenderedArtifact> {
  const functionTarget =
    !request.createFunction &&
    (target.service ||
      builder.artifacts.some(
        (item) => item.domain === target.domain.fileStem && item.kind === "function",
      ))
      ? resolveArtifact(builder, target, "function", request.target)
      : await renderFunction(builder, target, request.target);
  const artifact = domainArtifact(target, request.name, "tools", "tool", "tool");
  assertAvailableId(builder, artifact.id);
  await builder.create(
    artifact.path,
    toolSource(
      artifact,
      functionTarget,
      sourceModule(functionTarget.path),
      request.sideEffect,
      request.approval,
    ),
  );
  builder.registerArtifact("tool", {
    domain: target.domain.fileStem,
    path: artifact.path,
    binding: artifact.binding,
    id: artifact.id,
    exportKind: artifact.exportKind,
  });
  return artifact;
}

export async function renderAgent(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "agent" }>,
): Promise<RenderedArtifact> {
  const artifact = domainArtifact(target, request.name, "agents", "agent", "agent");
  assertAvailableId(builder, artifact.id);
  const [provider, modelId] = request.model.split(/:(.*)/s, 2);
  const profile = builder.discovery.profiles.find(
    (item) => item.capability === "model" && item.name === provider,
  );
  if (!profile) {
    if (!request.modelProvider || !request.modelId) {
      throw new AddScaffoldError(
        ADD_FAILURE_CODES.usage,
        `Model profile ${provider} does not exist; use --model-provider and --model-id.`,
      );
    }
    await ensureProviderProfile(builder, "model", {
      requested: provider,
      provider: request.modelProvider,
      modelId: request.modelId,
    });
  }
  const tools = request.tools.map((value) => {
    const tool = resolveArtifact(builder, target, "tool", value);
    return { binding: tool.binding, module: sourceModule(tool.path), exportKind: tool.exportKind };
  });
  const instructions = request.prompt
    ? promptInstructions(builder, target, request.prompt)
    : { text: request.instructions! };
  await builder.create(
    artifact.path,
    agentSource(artifact, modelId ? request.model : `${provider}`, tools, instructions),
  );
  builder.registerArtifact("agent", {
    domain: target.domain.fileStem,
    path: artifact.path,
    binding: artifact.binding,
    id: artifact.id,
    exportKind: artifact.exportKind,
  });
  return artifact;
}

function promptInstructions(builder: PlanBuilder, target: DomainTarget, value: string) {
  const prompt = resolveArtifact(builder, target, "prompt", value);
  return {
    binding: prompt.binding,
    module: sourceModule(prompt.path),
    exportKind: prompt.exportKind,
  };
}
