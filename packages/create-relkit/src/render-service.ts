import {
  ADD_FAILURE_CODES,
  AddScaffoldError,
  type AddRequest,
  type ServiceInclude,
} from "./add-types.js";
import { normalizeArtifactName } from "./add-name.js";
import { serviceSource, type DomainTarget } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { renderAgent, renderTool } from "./render-ai.js";
import {
  renderConstants,
  renderError,
  renderEvent,
  renderEventFunction,
  renderFunction,
  renderJob,
  renderPrompt,
} from "./render-domain.js";
import { renderBucket, renderCache } from "./render-resources.js";
import { renderRoute } from "./render-routes.js";

const FULL: readonly ServiceInclude[] = [
  "function",
  "event-function",
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

export async function renderService(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "service" }>,
): Promise<void> {
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
  await builder.create(target.servicePath, serviceSource(domain));
  const selected = closure(
    request.full ? FULL : request.include.length ? request.include : ["function"],
  );
  const error = selected.has("error") ? await renderError(builder, target, "example") : undefined;
  const event = selected.has("event") ? await renderEvent(builder, target, "example") : undefined;
  const fn = selected.has("function")
    ? await renderFunction(builder, target, "example", {
        ...(error ? { error } : {}),
        ...(event ? { event } : {}),
      })
    : undefined;
  if (selected.has("event-function")) {
    await renderEventFunction(
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
    await renderJob(
      builder,
      target,
      requestFor(builder, "job", { name: "Example", target: fn?.id ?? "example" }),
    );
  }
  if (selected.has("cache")) {
    await renderCache(builder, target, requestFor(builder, "cache", { name: "Example" }));
  }
  if (selected.has("bucket")) {
    await renderBucket(builder, target, requestFor(builder, "bucket", { name: "Example" }));
  }
  const tool = selected.has("tool")
    ? await renderTool(
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
    ? await renderPrompt(builder, target, "Example", [
        "Use the available tool and answer concisely.",
      ])
    : undefined;
  if (selected.has("agent")) {
    await renderAgent(
      builder,
      target,
      requestFor(builder, "agent", {
        name: "Example",
        tools: tool ? [tool.id] : [],
        prompt: prompt?.id ?? "example",
      }),
    );
  }
  if (selected.has("constants")) await renderConstants(builder, target, "Example");
  if (selected.has("route")) {
    await renderRoute(
      builder,
      requestFor(builder, "route", {
        path: `/${domain.fileStem}`,
        mode: "service-route",
        maps: { GET: fn?.binding ?? "example" },
      }),
      target,
    );
  }
}

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
