import type {
  createPulumiWorkspace,
  writePulumiProgram,
  PulumiBackend,
} from "@relkit/deploy-pulumi";
import type { DeploymentPlan } from "@relkit/deploy";
import type { Schema } from "effect";
import type { CliCommandContext } from "../main-support.js";
import type { BuildOptions, BuildResult } from "./build.js";
import type { CheckOptions, CheckResult } from "./check.js";
import type {
  LoadedDeploymentIntegrations,
  loadDeploymentIntegrations,
} from "./deployment-integrations.js";
import type { deployOperationSchema } from "./deploy.schemas.js";

/** Schema-validated selected operation. */
export type DeployOperation = typeof deployOperationSchema.Type;
/** User configuration passed only to the selected Pulumi workspace. */
export type ConfigMap = Record<string, { readonly value: string; readonly secret?: boolean }>;
/** Deployment presentation policy and optional caller cancellation. */
export type DeployContext = Pick<CliCommandContext, "json" | "reporter"> &
  Partial<Pick<CliCommandContext, "signal" | "log">>;
/** Opaque workspace ownership delegated to the Pulumi SDK. */
export type WorkspaceHandle = Awaited<ReturnType<typeof createPulumiWorkspace>>;
/** Deterministic generated program paths and bytes. */
export type ProgramFiles = Awaited<ReturnType<typeof writePulumiProgram>>;
/** Prepared immutable deployment cohort with its previous accepted plan. */
export interface Prepared {
  readonly root: string;
  readonly plan: DeploymentPlan;
  readonly previousPlan?: DeploymentPlan;
  readonly files: ProgramFiles;
  readonly integrations: LoadedDeploymentIntegrations;
}
/** Public compatibility overrides; native callers consume cancellation where supported. */
export interface DeployCommandOptions {
  readonly projectRoot?: string;
  /**
   * Runs the explicitly injected compiler compatibility edge.
   * @param options - Selected production project check.
   * @returns The complete accepted compiler cohort or public failure diagnostics.
   */
  readonly check?: (options: CheckOptions) => Promise<CheckResult>;
  /**
   * Runs the explicitly injected artifact builder compatibility edge.
   * @param options - Selected production cohort and destination.
   * @returns Existing public build outcome after native staging settles.
   */
  readonly build?: (options: BuildOptions) => Promise<BuildResult>;
  readonly createWorkspace?: typeof createPulumiWorkspace;
  readonly writeProgram?: typeof writePulumiProgram;
  readonly loadIntegrations?: typeof loadDeploymentIntegrations;
  /**
   * Asks one authorized custom confirmation without retrying.
   * @param question - Declared destructive/security change summary.
   * @param signal - Owner-issued cancellation joined before prompt release.
   * @returns The decision after physical native prompt settlement.
   */
  readonly confirm?: (question: string, signal: AbortSignal) => Promise<boolean>;
}
/** Validated arguments, independent of live SDK acquisition. */
export interface ParsedDeployArgs {
  readonly command: DeployOperation;
  readonly projectRoot?: string;
  readonly stack: string;
  readonly backend: PulumiBackend;
  readonly config: ConfigMap;
  readonly nonInteractive: boolean;
}
/** Portable command result ready for one frontend report. */
export interface DeployExecutionResult {
  readonly ok: boolean;
  readonly value: Record<string, unknown>;
  readonly human: string;
}
/** Pulumi command handle used only at the SDK boundary. */
export type PulumiStack = WorkspaceHandle["stack"];
/** Exact event callback payload from the installed SDK. */
export type PulumiPreviewOptions = NonNullable<Parameters<PulumiStack["preview"]>[0]>;
/** Provider event payload retained for SDK report construction. */
export type PulumiEvent = Parameters<NonNullable<PulumiPreviewOptions["onEvent"]>>[0];
