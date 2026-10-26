/**
 * Validates only selected capability/phase requirements before readiness.
 * The Layer captures read-only resolution; checks resolve adapters from projects
 * and peers from adapters, aggregate missing/version diagnostics, and never install.
 */
import { Context, Effect, Layer } from "effect";
import {
  selectedIntegrationRequirements,
  type IntegrationDependencyRequirement,
} from "@relkit/contracts";
import { DependencySource, DependencySourceLive } from "./dependency-source.service.js";
import { SelectedDependencyFailure } from "./dependency-preflight.errors.js";
import { observeProvider } from "./provider-observability.js";
import type {
  DependencyDiagnostic,
  DependencySelection,
  DependencySourceContract,
  DependencyPackageManager,
  InstalledPackageIdentity,
} from "./dependency-preflight.types.js";

/**
 * Formats a correction using project package-manager choice and install section.
 * @param selection - Explicit consumer/adapter/phase selection.
 * @param dependency - Missing/incompatible package with its supported range.
 * @returns Copyable command; evaluating this string never runs an installation.
 */
function installCommand(
  selection: DependencySelection & { readonly manager: DependencyPackageManager },
  dependency: IntegrationDependencyRequirement,
): string {
  const action = selection.manager === "npm" ? "install" : "add";
  const dev = dependency.installSection === "devDependencies" ? " -D" : "";
  const specifier = `${dependency.package}@${dependency.supportedRange}`;
  return `${selection.manager} ${action}${dev} ${/[\s<>|]/.test(specifier) ? `'${specifier}'` : specifier}`;
}

/**
 * Reports an absent selected adapter independently of its optional SDK peers.
 * @param selection - Consumer selection whose owning package cannot be resolved.
 * @returns A typed failure retaining source and the explicit project manager.
 */
function missingAdapter(
  selection: DependencySelection & { readonly manager: DependencyPackageManager },
): SelectedDependencyFailure {
  return new SelectedDependencyFailure({
    diagnostics: [
      {
        code: "RELKIT_DEPENDENCY_ADAPTER_MISSING",
        package: selection.adapter,
        supportedRange: "the declared RELKIT release",
        installedVersion: null,
        capabilities: selection.capabilities,
        ...(selection.source === undefined ? {} : { source: selection.source }),
        install: `${selection.manager} ${selection.manager === "npm" ? "install" : "add"} ${selection.adapter}`,
      },
    ],
  });
}

/** Formats one absent or incompatible SDK without changing the selected requirement. */
function dependencyDiagnostic(
  selection: DependencySelection & { readonly manager: DependencyPackageManager },
  requirement: IntegrationDependencyRequirement,
  identity: InstalledPackageIdentity | null,
): DependencyDiagnostic {
  return {
    code: identity === null ? "RELKIT_DEPENDENCY_MISSING" : "RELKIT_DEPENDENCY_VERSION_UNSUPPORTED",
    package: requirement.package,
    supportedRange: requirement.supportedRange,
    installedVersion: identity?.version ?? null,
    capabilities: requirement.capabilities.filter((value) =>
      selection.capabilities.includes(value),
    ),
    ...(selection.source === undefined ? {} : { source: selection.source }),
    install: installCommand(selection, requirement),
  };
}

/**
 * Resolves selected requirements through one captured source implementation.
 * @param source - Native or deterministic test metadata authority.
 * @param input - Requirements selected for this concrete consumer operation.
 * @returns Lazy verified identities or aggregate diagnostics; resolution failures stay distinct.
 */
const checkSelection = Effect.fn("SelectedDependencies.check")(
  function* (source: DependencySourceContract, input: DependencySelection) {
    if (
      input.requirements !== undefined &&
      selectedIntegrationRequirements(input.requirements, input.capabilities, input.phase)
        .length === 0
    )
      return [];
    const adapter = yield* source.resolve(input.adapter, input.adapterRoot ?? input.projectRoot);
    if (adapter === null)
      return yield* missingAdapter({
        ...input,
        manager: input.manager ?? (yield* source.manager(input.projectRoot)),
      });
    const requirements = selectedIntegrationRequirements(
      input.requirements ?? adapter.requirements ?? [],
      input.capabilities,
      input.phase,
    );
    if (requirements.length === 0) return [];
    const selection = {
      ...input,
      manager: input.manager ?? (yield* source.manager(input.projectRoot)),
    };
    const diagnostics: DependencyDiagnostic[] = [];
    const installed = [];
    for (const requirement of requirements) {
      const identity = yield* source.resolve(requirement.package, adapter.root);
      if (identity !== null && source.satisfies(identity.version, requirement.supportedRange)) {
        installed.push(identity);
        continue;
      }
      diagnostics.push(dependencyDiagnostic(selection, requirement, identity));
    }
    if (diagnostics.length > 0) return yield* new SelectedDependencyFailure({ diagnostics });
    return installed;
  },
  (effect) => observeProvider("dependency.check", effect),
);

/** Shared startup/compiler validator; each call retains its own selection and roots. */
export class SelectedDependencies extends Context.Service<SelectedDependencies>()(
  "relkit/provider/SelectedDependencies",
  {
    make: Effect.gen(function* () {
      const source = yield* DependencySource;
      return { check: (selection: DependencySelection) => checkSelection(source, selection) };
    }),
  },
) {}

/** Domain Layer leaves its native source replaceable without changing check behavior. */
export const SelectedDependenciesLayer = Layer.effect(
  SelectedDependencies,
  SelectedDependencies.make,
);

/** Live compiler/runtime composition has no CLI/compiler or concrete SDK dependency. */
export const SelectedDependenciesLive = SelectedDependenciesLayer.pipe(
  Layer.provide(DependencySourceLive),
);

export { DependencySource, DependencySourceLive } from "./dependency-source.service.js";
export {
  SelectedDependencyFailure,
  DependencyResolutionFailure,
} from "./dependency-preflight.errors.js";
export type * from "./dependency-preflight.types.js";
export { checkIntegrationDependencies } from "./dependency-plan.js";
export { initializeIntegration } from "./dependency-initialization.js";
export { SelectedDependencyInitializationFailure } from "./dependency-preflight.errors.js";
