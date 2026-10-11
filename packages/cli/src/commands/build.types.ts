/**
 * Describes accepted build inputs and staged cohort data shared by the build
 * workflow. These readonly contracts carry validated graph identities between
 * filesystem steps without acquiring resources or evaluating application code.
 */
import type { RuntimeActivationFingerprint } from "@relkit/contracts";
import type { Diagnostic } from "@relkit/diagnostics";
import type { CheckOptions } from "./check.types.js";
import type { CheckResult } from "./check-result.types.js";
import type { JobsManifest, LoadedToolingConfig } from "@relkit/compiler";
import type { ApplicationGraph } from "@relkit/graph";

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
  readonly tooling: Pick<LoadedToolingConfig, "server" | "inspector">;
}

/** Validated sources and identity captured once before materializing a stage. */
export interface BuildStageCohort {
  readonly graph: ApplicationGraph;
  readonly graphHash: string;
  readonly jobsManifest: JobsManifest | undefined;
  readonly manifestSource: string;
  readonly localServicesPlanSource: string | undefined;
  readonly activationFingerprint: RuntimeActivationFingerprint;
  readonly tooling: Pick<LoadedToolingConfig, "server" | "inspector">;
  readonly serverDirectory: string;
}
