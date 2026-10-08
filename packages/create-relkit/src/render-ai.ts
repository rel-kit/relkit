import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { ADD_FAILURE_CODES, AddScaffoldError, type AddRequest } from "./add-types.js";
import {
  assertAvailableId,
  domainArtifact,
  resolveArtifact,
  sourceModule,
  type DomainTarget,
} from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { agentSource, toolSource } from "./render-ai-sources.js";
import { renderFunctionEffect, type RenderedArtifact } from "./render-domain.js";

/**
 * Plans tool through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned tool source path and binding after request-state registration.
 */
export const renderToolEffect = Effect.fn("Scaffold.renderTool")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    request: Extract<AddRequest, { kind: "tool" }>,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const functionTarget =
      !request.createFunction &&
      (target.service ||
        builder.artifacts.some(
          (item) => item.domain === target.domain.fileStem && item.kind === "function",
        ))
        ? resolveArtifact(builder, target, "function", request.target)
        : yield* renderFunctionEffect(builder, target, request.target);
    const artifact = domainArtifact(target, request.name, "tools", "tool", "tool");
    assertAvailableId(builder, artifact.id);
    yield* builder.createEffect(
      artifact.path,
      toolSource(
        artifact,
        functionTarget,
        sourceModule(functionTarget.path),
        request.sideEffect,
        request.approval,
      ),
    );
    yield* builder.registerArtifactEffect("tool", {
      domain: target.domain.fileStem,
      path: artifact.path,
      binding: artifact.binding,
      id: artifact.id,
      exportKind: artifact.exportKind,
    });
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderTool", scaffoldErrors(effect)),
);

/**
 * Plans agent through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned agent source path and binding after request-state registration.
 */
export const renderAgentEffect = Effect.fn("Scaffold.renderAgent")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    request: Extract<AddRequest, { kind: "agent" }>,
  ): Effect.fn.Return<
    RenderedArtifact,
    GeneratorDomainError | GeneratorIoError,
    GeneratorFileSystem
  > {
    const artifact = domainArtifact(target, request.name, "agents", "agent", "agent");
    assertAvailableId(builder, artifact.id);
    if (request.model !== undefined) {
      const [profile] = request.model.split(":", 1);
      if (
        !builder.discovery.profiles.some(
          (item) => item.capability === "model" && item.name === profile,
        )
      ) {
        throw new AddScaffoldError(
          ADD_FAILURE_CODES.usage,
          `Model profile ${profile} does not exist; configure a native model profile first.`,
        );
      }
    } else {
      yield* builder.dependencyEffect("langchain");
    }
    const tools = request.tools.map((value) => {
      const tool = resolveArtifact(builder, target, "tool", value);
      return {
        binding: tool.binding,
        module: sourceModule(tool.path),
        exportKind: tool.exportKind,
      };
    });
    const instructions = request.prompt
      ? promptInstructions(builder, target, request.prompt)
      : { text: request.instructions! };
    yield* builder.createEffect(
      artifact.path,
      agentSource(artifact, request.model, tools, instructions),
    );
    yield* builder.registerArtifactEffect("agent", {
      domain: target.domain.fileStem,
      path: artifact.path,
      binding: artifact.binding,
      id: artifact.id,
      exportKind: artifact.exportKind,
    });
    return artifact;
  },
  (effect) => observeExecution("generator", "planning.renderAgent", scaffoldErrors(effect)),
);

/**
 * Resolves a prompt artifact's import metadata for agent instructions.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param value - Prompt ID, binding or normalized source stem.
 * @returns The prompt binding, @app module and export form.
 */
function promptInstructions(builder: PlanBuilder, target: DomainTarget, value: string) {
  const prompt = resolveArtifact(builder, target, "prompt", value);
  return {
    binding: prompt.binding,
    module: sourceModule(prompt.path),
    exportKind: prompt.exportKind,
  };
}

/**
 * Preserves the renderTool Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned tool source path and binding after typed planning settles.
 */
export function renderTool(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "tool" }>,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderToolEffect(builder, target, request));
}

/**
 * Preserves the renderAgent Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param request - Normalized scaffold request.
 * @returns The planned agent source path and binding after typed planning settles.
 */
export function renderAgent(
  builder: PlanBuilder,
  target: DomainTarget,
  request: Extract<AddRequest, { kind: "agent" }>,
): Promise<RenderedArtifact> {
  return runGeneratorPromise(renderAgentEffect(builder, target, request));
}
