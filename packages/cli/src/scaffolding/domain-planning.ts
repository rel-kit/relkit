/**
 * Plans service selection and public-member edits through generator filesystem
 * authority. Shared layout discovery chooses physical destinations; operations
 * remain lazy and translate expected scaffold failures without changing IDs.
 */

import { Effect } from "effect";
import { domainError, domainTry } from "create-relkit/internal/generator-errors";
import { scaffoldServiceBoundary } from "./scaffold-layout.js";
import { ADD_FAILURE_CODES, AddScaffoldError } from "create-relkit/internal/add-types";

import { observeExecution } from "@relkit/contracts/operation";

import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";

import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "create-relkit/internal/generator-errors";

import { runGeneratorPromise } from "create-relkit/internal/generator-runtime";

import { normalizeArtifactName } from "./add-name.js";

import { PlanBuilder } from "./plan-builder.js";

import { addFactoryObjectMember, addSourceImport } from "./source-edit.js";

/**
 * Plans resolve domain through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @returns The normalized owning domain and existing or newly planned service source.
 */
export const resolveDomainEffect = Effect.fn("Scaffold.resolveDomain")(
  function* (
    builder: PlanBuilder,
  ): Effect.fn.Return<DomainTarget, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const request = builder.request;
    if (request.service && request.createService)
      return yield* domainError(
        new AddScaffoldError(
          ADD_FAILURE_CODES.usage,
          "--service and --create-service are exclusive.",
        ),
      );
    if (request.createService) {
      const domain = yield* domainTry(() => normalizeArtifactName(request.createService ?? ""));
      if (builder.discovery.services.some((service) => service.domain === domain.fileStem)) {
        return yield* domainError(
          new AddScaffoldError(
            ADD_FAILURE_CODES.collision,
            `Service ${domain.fileStem} already exists.`,
          ),
        );
      }
      const servicePath = yield* domainTry(() =>
        scaffoldServiceBoundary(builder.discovery, domain.fileStem),
      );
      yield* builder.createEffect(servicePath, serviceSource(domain));
      return { domain, servicePath, service: undefined };
    }
    const generic = builder.discovery.services.filter(
      (service) => service.capability === "generic",
    );
    let selected = generic.length === 1 ? generic[0] : undefined;
    if (request.service) {
      const selectedName = yield* domainTry(() => normalizeArtifactName(request.service ?? ""));
      selected = generic.find((service) =>
        [service.domain, service.binding].includes(selectedName.fileStem),
      );
    }
    if (selected === undefined) {
      let message = "Multiple generic services exist; use --service <name>.";
      if (generic.length === 0) message = "No generic service exists; use --create-service <name>.";
      if (request.service) message = `Unknown generic service: ${request.service}`;
      return yield* domainError(new AddScaffoldError(ADD_FAILURE_CODES.usage, message));
    }
    return {
      domain: yield* domainTry(() => normalizeArtifactName(selected.domain)),
      servicePath: selected.path,
      service: selected,
    };
  },
  (effect) => observeExecution("generator", "planning.resolveDomain", scaffoldErrors(effect)),
);

/**
 * Plans add public member through the owning request and typed filesystem authority.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param category - Service member collection receiving the rendered artifact.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param artifactPath - Project-relative source path of the referenced artifact.
 * @returns Completion after the member import and service collection reference are planned.
 */
export const addPublicMemberEffect = Effect.fn("Scaffold.addPublicMember")(
  function* (
    builder: PlanBuilder,
    target: DomainTarget,
    category: "functions" | "events" | "tasks" | "jobs",
    artifact: DomainArtifact,
    artifactPath: string,
  ): Effect.fn.Return<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem> {
    const importPath = sourceModule(artifactPath);
    yield* builder.updateEffect(target.servicePath, (source) => {
      const imported = addSourceImport(
        source,
        target.servicePath,
        sourceImport(artifact.binding, importPath, artifact.exportKind),
      );
      return addFactoryObjectMember(
        imported,
        target.servicePath,
        ["defineService"],
        [category],
        artifact.binding,
        artifact.binding,
      );
    });
  },
  (effect) => observeExecution("generator", "planning.addPublicMember", scaffoldErrors(effect)),
);

/**
 * Preserves the resolveDomain Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @returns The normalized owning domain and existing or newly planned service source.
 */
export function resolveDomain(builder: PlanBuilder): Promise<DomainTarget> {
  return runGeneratorPromise(resolveDomainEffect(builder));
}

/**
 * Preserves the addPublicMember Promise compatibility API.
 * @param builder - Per-request planning owner.
 * @param target - Discovered domain or artifact target.
 * @param category - Service member collection receiving the rendered artifact.
 * @param artifact - Normalized artifact identity, source path, binding and export metadata.
 * @param artifactPath - Project-relative source path of the referenced artifact.
 * @returns Completion after the existing contract has been applied.
 */
export function addPublicMember(
  builder: PlanBuilder,
  target: DomainTarget,
  category: "functions" | "events" | "tasks" | "jobs",
  artifact: DomainArtifact,
  artifactPath: string,
): Promise<void> {
  return runGeneratorPromise(
    addPublicMemberEffect(builder, target, category, artifact, artifactPath),
  );
}

import { sourceModule, sourceImport, serviceSource } from "./domain-artifact.js";

export {
  domainArtifact,
  resolveArtifact,
  assertAvailableId,
  sourceModule,
  sourceImport,
  serviceSource,
} from "./domain-artifact.js";

import type { DomainTarget, DomainArtifact } from "./domain-planning.types.js";
export type { DomainTarget, DomainArtifact } from "./domain-planning.types.js";
