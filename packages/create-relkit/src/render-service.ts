import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import {
  ADD_FAILURE_CODES,
  AddScaffoldError,
  type AddRequest,
  type ServiceInclude,
} from "./add-types.js";
import { normalizeArtifactName } from "./add-name.js";
import { serviceSource, type DomainTarget } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { renderAgentEffect, renderToolEffect } from "./render-ai.js";
import {
  renderConstantsEffect,
  renderErrorEffect,
  renderEventEffect,
  renderEventFunctionEffect,
  renderFunctionEffect,
  renderJobEffect,
  renderTaskEffect,
  renderPromptEffect,
} from "./render-domain.js";
import { renderBucketEffect, renderCacheEffect } from "./render-resources.js";
import { renderRouteEffect } from "./render-routes.js";

/**
 * Artifacts included by the explicit full service preset.
 */
const FULL: readonly ServiceInclude[] = [
  "function",
  "event-function",
  "task",
  "error",
  "event",
  "job",
  "cache",
  "bucket",
  "tool",
  "prompt",
  "agent",
  "constants",
  "route",
];

/**
 * Plans service through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns Completion after the service and all prerequisite included artifacts are planned.
 */
export const renderServiceEffect = Effect.fn("Scaffold.renderService")(
  function* (
    builder: PlanBuilder,
    request: Extract<AddRequest, { kind: "service" }>,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const domain = normalizeArtifactName(request.name);
    if (
      builder.discovery.services.some((service) => service.domain === domain.fileStem) ||
      builder.discovery.artifacts.some((artifact) => artifact.domain === domain.fileStem)
    ) {
      throw new AddScaffoldError(
        ADD_FAILURE_CODES.collision,
        `Domain ${domain.fileStem} already exists.`,
      );
    }
    const target: DomainTarget = {
      domain,
      servicePath: `src/${domain.fileStem}/service.ts`,
      service: undefined,
    };
    yield* builder.createEffect(target.servicePath, serviceSource(domain));
    const selected = closure(
      request.full ? FULL : request.include.length ? request.include : ["function"],
    );
    const error = selected.has("error")
      ? yield* renderErrorEffect(builder, target, "example")
      : undefined;
    const event = selected.has("event")
      ? yield* renderEventEffect(builder, target, "example")
      : undefined;
    const fn = selected.has("function")
      ? yield* renderFunctionEffect(builder, target, "example", {
          ...(error ? { error } : {}),
          ...(event ? { event } : {}),
        })
      : undefined;
    const taskExecution = selected.has("task") ? taskExecutionFor(builder) : undefined;
    const task = selected.has("task")
      ? yield* renderTaskEffect(
          builder,
          target,
          requestFor(builder, "task", {
            name: "Example",
            version: "1",
            execution: taskExecution ?? "durable",
          }),
        )
      : undefined;
    if (selected.has("event-function")) {
      yield* renderEventFunctionEffect(
        builder,
        target,
        requestFor(builder, "event-function", {
          name: "On Example",
          event: event?.id ?? "example",
          delivery: "durable",
        }),
      );
    }
    if (selected.has("job")) {
      yield* renderJobEffect(
        builder,
        target,
        requestFor(builder, "job", { name: "Example", target: task?.id ?? fn?.id ?? "example" }),
      );
    }
    if (selected.has("cache")) {
      yield* renderCacheEffect(builder, target, requestFor(builder, "cache", { name: "Example" }));
    }
    if (selected.has("bucket")) {
      yield* renderBucketEffect(
        builder,
        target,
        requestFor(builder, "bucket", { name: "Example" }),
      );
    }
    const tool = selected.has("tool")
      ? yield* renderToolEffect(
          builder,
          target,
          requestFor(builder, "tool", {
            name: "Example",
            target: fn?.id ?? "example",
            sideEffect: "read",
            approval: "never",
          }),
        )
      : undefined;
    const prompt = selected.has("prompt")
      ? yield* renderPromptEffect(builder, target, "Example", [
          "Use the available tool and answer concisely.",
        ])
      : undefined;
    if (selected.has("agent")) {
      yield* renderAgentEffect(
        builder,
        target,
        requestFor(builder, "agent", {
          name: "Example",
          tools: tool ? [tool.id] : [],
          prompt: prompt?.id ?? "example",
        }),
      );
    }
    if (selected.has("constants")) yield* renderConstantsEffect(builder, target, "Example");
    if (selected.has("route")) {
      yield* renderRouteEffect(
        builder,
        requestFor(builder, "route", {
          path: `/${domain.fileStem}`,
          mode: "service-route",
          maps: { GET: fn?.binding ?? "example" },
        }),
        target,
      );
    }
  },
  (effect) => observeExecution("generator", "planning.renderService", scaffoldErrors(effect)),
);

/**
 * Chooses task execution compatible with the default job adapter.
 * @param builder - Per-request planning owner.
 * @returns Retryable for effect-mq, otherwise durable.
 */
function taskExecutionFor(builder: PlanBuilder): "durable" | "retryable" {
  const profile = builder.profiles.find((item) => item.capability === "job" && item.isDefault);
  return profile?.adapter?.includes("effectMq") ? "retryable" : "durable";
}

/**
 * Adds prerequisite artifacts needed by the requested service includes.
 * @param input - Explicit service artifact includes.
 * @returns A set containing requested artifacts and their function/event/tool/prompt dependencies.
 */
function closure(input: readonly ServiceInclude[]): Set<ServiceInclude> {
  const selected = new Set(input);
  if (["error", "job", "tool", "route"].some((kind) => selected.has(kind as ServiceInclude)))
    selected.add("function");
  if (selected.has("event-function")) selected.add("event");
  if (selected.has("agent")) {
    selected.add("function");
    selected.add("tool");
    selected.add("prompt");
  }
  return selected;
}

/**
 * Projects shared planning fields into one kind-specific scaffold request.
 * @typeParam Kind - Discriminant identifying the constructed artifact request.
 * @param builder - Per-request planning owner.
 * @param kind - Artifact kind whose request is constructed.
 * @param options - Fields specific to the selected artifact request.
 * @returns The selected request with project/install fields from its request owner.
 */
function requestFor<Kind extends AddRequest["kind"]>(
  builder: PlanBuilder,
  kind: Kind,
  options: Omit<Extract<AddRequest, { kind: Kind }>, "kind" | "projectRoot" | "install">,
): Extract<AddRequest, { kind: Kind }> {
  return {
    kind,
    projectRoot: builder.discovery.projectRoot,
    install: builder.request.install,
    ...options,
  } as Extract<AddRequest, { kind: Kind }>;
}

/**
 * Preserves the renderService Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param request - Normalized scaffold request.
 * @returns Completion after the existing contract has been applied.
 */
export function renderService(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "service" }>,
): Promise<void> {
  return runGeneratorPromise(renderServiceEffect(builder, request));
}
