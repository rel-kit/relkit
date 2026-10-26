/**
 * Defines finite fixture selections and retained footprint samples. Install
 * attempts carry cache state, command output, failures and archive observations
 * separately from the later functional and performance certification gates.
 */
import type {
  DependencyAccounting,
  InstalledDependency,
} from "./consumer-dependency-policy.types.js";
import type { ConsumerInstallation } from "./consumer-installation.types.js";
import type { ManifestOwnership } from "./consumer-ownership.types.js";
import type { ConsumerResources } from "./consumer-resources.types.js";

/** One external dependency fixture, independent of public starter certification. */
export interface ConsumerFixture {
  readonly name: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly production: boolean;
}

/** Native manager and layout selected explicitly by the benchmark caller. */
export type ConsumerManager = "bun" | "bun-isolated" | "npm" | "pnpm";

/** Fully resolved executable options; fixture names may narrow costly work. */
export interface ConsumerBenchmarkOptions {
  readonly stage: "baseline" | "1" | "final";
  readonly repository: string;
  readonly output: string;
  readonly inventoryOnly: boolean;
  readonly artifacts?: string;
  readonly fixtures: readonly string[];
  readonly manager: ConsumerManager;
  /** Retain the final warm install for independent executable/type/artifact probes. */
  readonly retainInstallations?: boolean;
}

/** A measured install sample; inspection remains absent when installation failed. */
export interface ConsumerInstallSample {
  readonly fixture: string;
  readonly manager: ConsumerManager;
  readonly condition: "cold-owned-cache" | "warm-owned-cache";
  readonly durationMs: number;
  readonly transferredBytes: number;
  readonly command: readonly string[];
  readonly stdout: string;
  readonly failure: string | null;
  readonly root: string;
  readonly installation: ConsumerInstallation | null;
  readonly instances: readonly InstalledDependency[];
  readonly accounting: DependencyAccounting | null;
}

/** Complete or resource-deferred matrix with all successful samples retained. */
export interface ConsumerMeasurement {
  readonly samples: readonly ConsumerInstallSample[];
  readonly artifactDirectory: string | null;
  readonly omitted: readonly string[];
  readonly blocked: {
    readonly resources: ConsumerResources;
    readonly blocked: string | null;
  } | null;
}

/** Run identity and source observations captured before external measurement. */
export interface ConsumerRunContext {
  readonly options: ConsumerBenchmarkOptions;
  readonly temporary: string;
  readonly id: string;
  readonly ownership: readonly ManifestOwnership[];
  readonly timestamp: string;
  readonly environment: {
    readonly os: string;
    readonly release: string;
    readonly architecture: string;
    readonly cpus: number;
    readonly load: readonly number[];
    readonly freeMemoryBytes: number;
    readonly totalMemoryBytes: number;
    readonly bun: string;
    readonly bunNodeCompatibility: string;
  };
}
