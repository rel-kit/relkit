import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { scaffoldErrors } from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import type { ScaffoldPlanningService } from "./add-plan.types.js";
import type { AddRequest, ScaffoldPlan } from "./add-types.js";
import { resolveDomainEffect } from "./domain-planning.js";
import { PlanBuilder } from "./plan-builder.js";
import { ProjectDiscoveryServiceTag, projectDiscoveryLive } from "./project-discovery.js";
import { renderAgentEffect, renderToolEffect } from "./render-ai.js";
import { renderAuthEffect } from "./render-auth.js";
import { renderDatabaseEffect } from "./render-database.js";
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
import {
  renderMiddlewareEffect,
  renderRouteEffect,
  renderTransformEffect,
} from "./render-routes.js";
import { renderServiceEffect } from "./render-service.js";

/** Inspects a project and produces one complete, conflict-checked add plan. */

/** Cohesive discovery and planning authority, with isolated Ref state per request. */
export class ScaffoldPlanning extends Context.Service<ScaffoldPlanning, ScaffoldPlanningService>()(
  "create-relkit/ScaffoldPlanning",
) {}

/**
 * Planning Layer captures only declaration discovery and filesystem authority.
 * @returns A ScaffoldPlanning Layer requiring declaration discovery and filesystem services.
 */
export const scaffoldPlanningLive = Layer.effect(
  ScaffoldPlanning,
  Effect.gen(function* () {
    const discovery = yield* ProjectDiscoveryServiceTag;
    const fs = yield* GeneratorFileSystem;
    return ScaffoldPlanning.of({
      plan: Effect.fn("ScaffoldPlanning.plan")((request: AddRequest) =>
        observeExecution(
          "generator",
          "planning.plan",
          Effect.gen(function* () {
            const builder = new PlanBuilder(
              request,
              yield* discovery.discover(request.projectRoot),
            );
            if (request.kind === "service") yield* renderServiceEffect(builder, request);
            else if (request.kind === "route") {
              const target =
                request.mode === "service-route" ? yield* resolveDomainEffect(builder) : undefined;
              if (target && !target.service) {
                for (const member of new Set(Object.values(request.maps))) {
                  yield* renderFunctionEffect(builder, target, member);
                }
              }
              yield* renderRouteEffect(builder, request, target);
            } else if (request.kind === "middleware")
              yield* renderMiddlewareEffect(builder, request);
            else if (request.kind === "transform") yield* renderTransformEffect(builder, request);
            else if (request.kind === "database") yield* renderDatabaseEffect(builder, request);
            else if (request.kind === "auth") yield* renderAuthEffect(builder, request);
            else {
              const target = yield* resolveDomainEffect(builder);
              if (request.kind === "function")
                yield* renderFunctionEffect(builder, target, request.name, request);
              else if (request.kind === "error")
                yield* renderErrorEffect(builder, target, request.name);
              else if (request.kind === "event")
                yield* renderEventEffect(builder, target, request.name, request);
              else if (request.kind === "event-function")
                yield* renderEventFunctionEffect(builder, target, request);
              else if (request.kind === "task") yield* renderTaskEffect(builder, target, request);
              else if (request.kind === "job") yield* renderJobEffect(builder, target, request);
              else if (request.kind === "cache") yield* renderCacheEffect(builder, target, request);
              else if (request.kind === "bucket")
                yield* renderBucketEffect(builder, target, request);
              else if (request.kind === "tool") yield* renderToolEffect(builder, target, request);
              else if (request.kind === "prompt")
                yield* renderPromptEffect(builder, target, request.name, request.text);
              else if (request.kind === "agent") yield* renderAgentEffect(builder, target, request);
              else if (request.kind === "constants")
                yield* renderConstantsEffect(builder, target, request.name);
            }
            return yield* builder.finishEffect();
          }).pipe(scaffoldErrors, Effect.provideService(GeneratorFileSystem, fs)),
          () => ({ requests: 1 }),
        ),
      ),
    });
  }),
);

/**
 * Plans an artifact through an explicitly supplied planning service.
 * @param request - Normalized scaffold request.
 * @returns A lazy immutable plan; planning never writes project files.
 */
export const planAddEffect = Effect.fn("ScaffoldPlanning.add")(
  function* (request: AddRequest) {
    return yield* (yield* ScaffoldPlanning).plan(request);
  },
  (effect) => observeExecution("generator", "ScaffoldPlanning.add", effect),
);

/**
 * Preserves the existing public Promise API and stable rejection constructors.
 * @param request - Normalized scaffold request.
 * @returns All ordered file operations and dependency ownership decisions.
 */
export function planAdd(request: AddRequest): Promise<ScaffoldPlan> {
  return runGeneratorPromise(
    planAddEffect(request).pipe(
      Effect.provide(scaffoldPlanningLive),
      Effect.provide(projectDiscoveryLive),
    ),
  );
}
