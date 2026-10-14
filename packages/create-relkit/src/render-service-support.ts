/**
 * Composes optional managed resources, AI declarations and HTTP routes into a
 * service bundle after prerequisites exist. These are source declarations only;
 * provider/model activation remains outside scaffold planning.
 */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { scaffoldErrors } from "./generator-errors.js";
import { renderCacheEffect, renderBucketEffect } from "./render-resources.js";
import { renderAgentEffect, renderToolEffect } from "./render-ai.js";
import { renderPromptEffect, renderConstantsEffect } from "./render-domain.js";
import { renderRouteEffect } from "./render-routes.js";
import { serviceRequest } from "./render-service-requests.js";
import type { ServiceInclude } from "./add-types.js";
import type { PlanBuilder } from "./plan-builder.js";
import type { DomainArtifact, DomainTarget } from "./domain-planning.types.js";
import type { ServicePrimaryArtifacts } from "./render-service.types.js";

/**
 * Plans optional cache/bucket declarations with their existing provider policies.
 * @param builder - Per-request planning owner.
 * @param target - Selected service boundary.
 * @param selected - Closed bundle capability selection.
 * @returns Lazy renderer completion retaining filesystem authority and typed failures.
 */
export const renderServiceResourcesEffect = Effect.fn("Scaffold.renderServiceResources")(
  function* (builder: PlanBuilder, target: DomainTarget, selected: ReadonlySet<ServiceInclude>) {
    if (selected.has("cache"))
      yield* renderCacheEffect(
        builder,
        target,
        serviceRequest(builder, "cache", { name: "Example" }),
      );
    if (selected.has("bucket"))
      yield* renderBucketEffect(
        builder,
        target,
        serviceRequest(builder, "bucket", { name: "Example" }),
      );
  },
  (effect) =>
    observeExecution("generator", "planning.renderServiceResources", scaffoldErrors(effect)),
);

/**
 * Plans tools/prompts before agents referencing their established identities.
 * @param builder - Per-request planning owner.
 * @param target - Selected service boundary.
 * @param selected - Closed bundle capability selection.
 * @param primary - Public callable prerequisites for generated tools.
 * @returns Lazy source-only AI composition with no model calls.
 */
export const renderServiceAiEffect = Effect.fn("Scaffold.renderServiceAi")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    selected: ReadonlySet<ServiceInclude>,
    primary: ServicePrimaryArtifacts,
  ) {
    let tool: DomainArtifact | undefined;
    if (selected.has("tool"))
      tool = yield* renderToolEffect(
        builder,
        target,
        serviceRequest(builder, "tool", {
          name: "Example",
          target: primary.fn?.id ?? "example",
          sideEffect: "read",
          approval: "never",
        }),
      );
    let prompt: DomainArtifact | undefined;
    if (selected.has("prompt"))
      prompt = yield* renderPromptEffect(builder, target, "Example", [
        "Use the available tool and answer concisely.",
      ]);
    if (selected.has("agent"))
      yield* renderAgentEffect(
        builder,
        target,
        serviceRequest(builder, "agent", {
          name: "Example",
          tools: tool ? [tool.id] : [],
          prompt: prompt?.id ?? "example",
        }),
      );
  },
  (effect) => observeExecution("generator", "planning.renderServiceAi", scaffoldErrors(effect)),
);

/**
 * Finishes constants and public service-route mappings after callable planning.
 * @param builder - Per-request planning owner.
 * @param target - Selected service boundary and logical identity.
 * @param selected - Closed bundle capability selection.
 * @param primary - Public callable identity selected for the route.
 * @returns Lazy final source planning, preserving route URL and transport defaults.
 */
export const renderServiceTransportEffect = Effect.fn("Scaffold.renderServiceTransport")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    selected: ReadonlySet<ServiceInclude>,
    primary: ServicePrimaryArtifacts,
  ) {
    if (selected.has("constants")) yield* renderConstantsEffect(builder, target, "Example");
    if (selected.has("route"))
      yield* renderRouteEffect(
        builder,
        serviceRequest(builder, "route", {
          path: `/${target.domain.fileStem}`,
          mode: "service-route",
          maps: { GET: primary.fn?.binding ?? "example" },
        }),
        target,
      );
  },
  (effect) =>
    observeExecution("generator", "planning.renderServiceTransport", scaffoldErrors(effect)),
);
