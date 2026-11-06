/**
 * Describes accepted build inputs and staged cohort data shared by the build
 * workflow. These readonly contracts carry validated graph identities between
 * filesystem steps without acquiring resources or evaluating application code.
 */
import type { RuntimeActivationFingerprint } from "relkit/contracts";
import type { Diagnostic } from "relkit/diagnostics";
import type { CheckOptions } from "./check.types.js";
import type { CheckResult } from "./check-result.types.js";
import type { JobsManifest, LoadedToolingConfig } from "../compiler/index.js";
import type { ApplicationGraph } from "relkit/graph";
import type { ProductionRepairs } from "./build-production-repairs.js";
import type { RuntimeAdapterName } from "relkit/runtime";

/** Build inputs; an injected check remains the established public compatibility seam. */
export interface BuildOptions extends CheckOptions {
  readonly buildDirectory?: string;
  /**
   * Runs one explicitly injected compatibility check before staging.
   * @param options - The exact project, mode and generation being built.
   * @returns The accepted check cohort or existing public diagnostics.
   */
  readonly check?: (options: CheckOptions) => Promise<CheckResult>;
  readonly providerOverridesGeneration?: string;
  /** Runtime the production server and container run on; defaults to Bun. */
  readonly runtime?: RuntimeAdapterName;
  /** Deploy target whose rules the build enforces; `vercel` refuses local durable state and stale crons. */
  readonly target?: "vercel";
  /**
   * Bundles a development build too. Local Docker job workers run the generation's
   * `server/index.js` in a container that mounts only the generation and `node_modules`.
   */
  readonly developmentBundle?: boolean;
  /** Internal preparation requests Bun's consumed-input inventory beside the entrypoint. */
  readonly bundleInputInventory?: "bun.inputs.json";
}

/** Published build cohort or deterministic failure diagnostics. */
export interface BuildResult {
  readonly ok: boolean;
  readonly projectRoot: string;
  readonly buildDirectory: string;
  readonly graphHash?: string;
  readonly activationFingerprint?: RuntimeActivationFingerprint;
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly string[];
}

/** Inputs owned by a single build stage; the public directory is published only after success. */
export interface BuildStageInputs {
  readonly projectRoot: string;
  readonly buildDirectory: string;
  readonly stage: string;
  readonly checked: CheckResult & { readonly graphHash: string };
  readonly options: BuildOptions;
}

/** Immutable manifest projection for one accepted server cohort. */
export interface BuildManifestInputs {
  readonly graphHash: string;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly hasJobs: boolean;
  readonly hasLocalServices: boolean;
  /** Recorded only for a non-default runtime, so Bun manifests stay unchanged. */
  readonly runtime?: RuntimeAdapterName;
  readonly tooling: Pick<LoadedToolingConfig, "server" | "inspector">;
}

/** Validated sources and identity captured once before materializing a stage. */
export interface BuildStageCohort {
  readonly productionDependencies: Readonly<Record<string, string>>;
  readonly productionRepairs: ProductionRepairs;
  readonly graph: ApplicationGraph;
  readonly graphHash: string;
  readonly jobsManifest: JobsManifest | undefined;
  readonly manifestSource: string;
  readonly localServicesPlanSource: string | undefined;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly tooling: Pick<LoadedToolingConfig, "server" | "inspector">;
  readonly serverDirectory: string;
}
