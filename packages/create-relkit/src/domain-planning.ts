import { Effect } from "effect";

import { observeExecution } from "@relkit/contracts/operation";

import { GeneratorFileSystem } from "./generator-filesystem.js";

import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
} from "./generator-errors.js";

import { runGeneratorPromise } from "./generator-runtime.js";

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
      usage("--service and --create-service are exclusive.");
    if (request.createService) {
      const domain = normalizeArtifactName(request.createService);
      if (builder.discovery.services.some((service) => service.domain === domain.fileStem)) {
        collision(`Service ${domain.fileStem} already exists.`);
      }
      const servicePath = `src/${domain.fileStem}/service.ts`;
      yield* builder.createEffect(servicePath, serviceSource(domain));
      return { domain, servicePath, service: undefined };
    }
    const generic = builder.discovery.services.filter(
      (service) => service.capability === "generic",
    );
    const selected = request.service
      ? generic.find((service) =>
          [service.domain, service.binding].includes(
            normalizeArtifactName(request.service!).fileStem,
          ),
        )
      : generic.length === 1
        ? generic[0]
        : undefined;
    if (selected === undefined) {
      usage(
        request.service
          ? `Unknown generic service: ${request.service}`
          : generic.length === 0
            ? "No generic service exists; use --create-service <name>."
            : "Multiple generic services exist; use --service <name>.",
      );
    }
    return {
      domain: normalizeArtifactName(selected.domain),
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

import {
  sourceModule,
  sourceImport,
  serviceSource,
  usage,
  collision,
  fileStem,
} from "./domain-artifact.js";

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
