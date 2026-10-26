/**
 * Describes selected dependency checks independently of compiler or CLI code.
 * Resolver roots belong to the application and selected adapter, while diagnostics
 * retain enough safe metadata to explain corrections without mutating projects.
 */
import type { Effect } from "effect";
import type {
  IntegrationDependencyPhase,
  IntegrationDependencyRequirement,
} from "@relkit/contracts";
import type { DependencyResolutionFailure } from "./dependency-preflight.errors.js";

/** Supported project installers, independent of the executable package runner. */
export type DependencyPackageManager = "bun" | "npm" | "pnpm";

/** Canonical installed identity read from metadata without evaluating the module. */
export interface InstalledPackageIdentity {
  readonly name: string;
  readonly version: string;
  readonly root: string;
  readonly integrationId?: string;
  readonly requirements?: readonly IntegrationDependencyRequirement[];
}

/** Native read-only resolution and semver comparison, substitutable in tests. */
export interface DependencySourceContract {
  readonly manager: (
    projectRoot: string,
  ) => Effect.Effect<DependencyPackageManager, DependencyResolutionFailure>;
  readonly resolve: (
    name: string,
    from: string,
  ) => Effect.Effect<InstalledPackageIdentity | null, DependencyResolutionFailure>;
  readonly satisfies: (version: string, range: string) => boolean;
}

/** Explicit application selection; runner cache directories are never resolver roots. */
export interface DependencySelection {
  readonly projectRoot: string;
  readonly adapter: string;
  /** Canonical package root supplied by that adapter's loaded entrypoint. */
  readonly adapterRoot?: string;
  readonly capabilities: readonly string[];
  readonly phase: IntegrationDependencyPhase;
  readonly requirements?: readonly IntegrationDependencyRequirement[];
  /** Explicit installer override; omission reads the actual consumer manifest. */
  readonly manager?: DependencyPackageManager;
  readonly source?: string;
}

/** A safely disclosable missing/version mismatch; never contains credentials. */
export interface DependencyDiagnostic {
  readonly code:
    | "RELKIT_DEPENDENCY_MISSING"
    | "RELKIT_DEPENDENCY_VERSION_UNSUPPORTED"
    | "RELKIT_DEPENDENCY_ADAPTER_MISSING";
  readonly package: string;
  readonly supportedRange: string;
  readonly installedVersion: string | null;
  readonly capabilities: readonly string[];
  readonly source?: string;
  readonly install: string;
}
