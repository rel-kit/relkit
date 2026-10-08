import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GeneratorPrompt, generatorPromptLayer } from "./generator-prompt.js";
import { createClackPromptDriver } from "./prompt-driver.js";
import {
  scaffoldErrors,
  type GeneratorDomainError,
  type GeneratorIoError,
  type GeneratorPromptError,
} from "./generator-errors.js";
import { runGeneratorPromise } from "./generator-runtime.js";
import { normalizeArtifactName } from "./add-name.js";
import type { AddKind } from "./add-types.js";
import { AddResolutionState, label } from "./add-resolution-state.js";
import type {
  DiscoveredArtifact,
  DiscoveredProfile,
  ProjectDiscovery,
} from "./project-discovery-types.js";

/**
 * Artifact kinds that can be placed inside a generic service.
 */
const SERVICE_KINDS = new Set<AddKind>([
  "function",
  "error",
  "event",
  "event-function",
  "task",
  "job",
  "cache",
  "bucket",
  "tool",
  "prompt",
  "agent",
  "constants",
]);

/**
 * Resolves resolve service through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after a missing service choice is recorded in request state.
 */
export const resolveServiceEffect = Effect.fn("AddResolution.resolveService")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (state.parsed.service || state.parsed.createService) return;
    const services = discovery.services.filter((service) => service.capability === "generic");
    if (!state.interactive) {
      if (services.length === 1) yield* state.optionEffect("service", services[0]!.domain);
      return;
    }
    const create = "__create_service__";
    const selected = yield* state.selectEffect("Choose a service", [
      ...services.map((service) => ({
        value: service.domain,
        label: label(service.domain),
        hint: service.path,
      })),
      { value: create, label: "Create a new service" },
    ]);
    if (selected === create) {
      const name = yield* state.textEffect("New service name", undefined, true);
      if (name) yield* state.optionEffect("create-service", name);
    } else if (selected) yield* state.optionEffect("service", selected);
  },
  (effect) => observeExecution("generator", "add.resolve.resolveService", scaffoldErrors(effect)),
);

/**
 * Resolves resolve service for kind through explicit prompt and filesystem authority.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after service selection is resolved for the requested artifact kind.
 */
export const resolveServiceForKindEffect = Effect.fn("AddResolution.resolveServiceForKind")(
  function* (
    state: AddResolutionState,
    discovery: ProjectDiscovery,
  ): Effect.fn.Return<
    void,
    GeneratorDomainError | GeneratorIoError | GeneratorPromptError,
    GeneratorPrompt | GeneratorFileSystem
  > {
    if (SERVICE_KINDS.has(state.parsed.kind)) yield* resolveServiceEffect(state, discovery);
  },
  (effect) =>
    observeExecution("generator", "add.resolve.resolveServiceForKind", scaffoldErrors(effect)),
);

/**
 * Resolves the selected service to its normalized domain identity.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns The requested/new service domain, or undefined when no service was selected.
 */
export function selectedDomain(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): string | undefined {
  const parsed = state.parsed;
  if (parsed.createService) return normalizeArtifactName(parsed.createService).fileStem;
  if (!parsed.service) return undefined;
  const normalized = normalizeArtifactName(parsed.service).fileStem;
  return (
    discovery.services.find(
      (service) =>
        service.capability === "generic" &&
        [service.domain, normalizeArtifactName(service.binding).fileStem].includes(normalized),
    )?.domain ?? normalized
  );
}

/**
 * Selects exported artifacts of one kind within a domain.
 * @param discovery - Declaration-only project facts.
 * @param domain - Normalized owning domain, or undefined for root artifacts.
 * @param kind - Artifact kind to select.
 * @returns Matching source-discovered artifacts in discovery order.
 */
export function artifacts(
  discovery: ProjectDiscovery,
  domain: string | undefined,
  kind: DiscoveredArtifact["kind"],
): readonly DiscoveredArtifact[] {
  return discovery.artifacts.filter(
    (artifact) => artifact.domain === domain && artifact.kind === kind && artifact.exported,
  );
}

/**
 * Builds prompt choices from exported artifact identities.
 * @param values - Matching discovered artifacts.
 * @returns Choice values using descriptor IDs when available, with source-path hints.
 */
export function artifactOptions(values: readonly DiscoveredArtifact[]) {
  return values.map((artifact) => ({
    value: artifact.id ?? artifact.binding,
    label: label(artifact.binding),
    hint: artifact.path,
  }));
}

/**
 * Selects provider profiles for one capability.
 * @param discovery - Declaration-only project facts.
 * @param capability - Requested provider capability.
 * @returns Profiles of the requested capability in discovery order.
 */
export function profiles(
  discovery: ProjectDiscovery,
  capability: DiscoveredProfile["capability"],
): readonly DiscoveredProfile[] {
  return discovery.profiles.filter((profile) => profile.capability === capability);
}

/**
 * Preserves the existing resolveService Promise API.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after the existing contract has been applied.
 */
export function resolveService(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  return runGeneratorPromise(
    resolveServiceEffect(state, discovery).pipe(
      Effect.provide(generatorPromptLayer(state.prompt ?? createClackPromptDriver())),
    ),
  );
}

/**
 * Preserves the existing resolveServiceForKind Promise API.
 * @param state - Invocation-owned state or a read-only planning snapshot.
 * @param discovery - Declaration-only project facts.
 * @returns Completion after the existing contract has been applied.
 */
export function resolveServiceForKind(
  state: AddResolutionState,
  discovery: ProjectDiscovery,
): Promise<void> {
  return runGeneratorPromise(
    resolveServiceForKindEffect(state, discovery).pipe(
      Effect.provide(generatorPromptLayer(state.prompt ?? createClackPromptDriver())),
    ),
  );
}
