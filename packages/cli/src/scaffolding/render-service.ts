/**
 * Plans a service bundle at the compiler-selected flat or grouped boundary.
 * Existing renderers retain logical IDs, policies and source-only planning; the
 * generator transaction owns filesystem publication and failure restoration.
 */

import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { scaffoldErrors, domainError, domainTry } from "create-relkit/internal/generator-errors";
import { runGeneratorPromise } from "create-relkit/internal/generator-runtime";
import {
  ADD_FAILURE_CODES,
  AddScaffoldError,
  type AddRequest,
} from "create-relkit/internal/add-types";
import { normalizeArtifactName } from "./add-name.js";
import { serviceSource, type DomainTarget } from "./domain-planning.js";
import { scaffoldServiceBoundary } from "./scaffold-layout.js";
import { FULL_SERVICE, serviceIncludes } from "./render-service-requests.js";
import { renderServiceMembersEffect, renderServiceWorkEffect } from "./render-service-members.js";
import {
  renderServiceResourcesEffect,
  renderServiceAiEffect,
  renderServiceTransportEffect,
} from "./render-service-support.js";
import type { PlanBuilder } from "./plan-builder.js";

/**
 * Plans a complete service and closes its requested artifact prerequisites.
 * @param builder - Per-request planning owner with declaration-only discovery.
 * @param request - Normalized service name and requested capability preset.
 * @returns Lazy completion with typed scaffold/filesystem failures; no resource activation.
 */
export const renderServiceEffect = Effect.fn("Scaffold.renderService")(
  function* (builder: PlanBuilder, request: Extract<AddRequest, { kind: "service" }>) {
    const domain = yield* domainTry(() => normalizeArtifactName(request.name));
    if (
      builder.discovery.services.some((service) => service.domain === domain.fileStem) ||
      builder.discovery.artifacts.some((artifact) => artifact.domain === domain.fileStem)
    ) {
      return yield* domainError(
        new AddScaffoldError(
          ADD_FAILURE_CODES.collision,
          `Domain ${domain.fileStem} already exists.`,
        ),
      );
    }
    const servicePath = yield* domainTry(() =>
      scaffoldServiceBoundary(builder.discovery, domain.fileStem),
    );
    const target: DomainTarget = { domain, servicePath, service: undefined };
    yield* builder.createEffect(target.servicePath, serviceSource(domain));
    let includes = request.include;
    if (request.full) includes = FULL_SERVICE;
    else if (includes.length === 0) includes = ["function"];
    const selected = serviceIncludes(includes);
    const primary = yield* renderServiceMembersEffect(builder, target, selected);
    yield* renderServiceWorkEffect(builder, target, selected, primary);
    yield* renderServiceResourcesEffect(builder, target, selected);
    yield* renderServiceAiEffect(builder, target, selected, primary);
    yield* renderServiceTransportEffect(builder, target, selected, primary);
  },
  (effect) => observeExecution("generator", "planning.renderService", scaffoldErrors(effect)),
);

/**
 * Preserves the existing Promise compatibility boundary for service-bundle planning.
 * @param builder - Per-request planning owner.
 * @param request - Complete normalized service request.
 * @returns After all requested source declarations are planned; native errors retain identity.
 */
export function renderService(
  builder: PlanBuilder,
  request: Extract<AddRequest, { kind: "service" }>,
): Promise<void> {
  return runGeneratorPromise(renderServiceEffect(builder, request));
}
