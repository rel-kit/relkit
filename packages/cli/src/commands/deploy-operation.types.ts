/** Declares operation requirements without leaking native SDK declaration paths. */
import type { Effect, Ref } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { CliFileSystem } from "../services/filesystem.service.js";
import type { CliPulumi } from "../services/pulumi.service.js";
import type { CliDeployConfirmation } from "../services/deploy-confirmation.service.js";
import type {
  DeployExecutionResult,
  Prepared,
  WorkspaceHandle,
  ParsedDeployArgs,
  PulumiEvent,
} from "./deploy-support.types.js";

/** The same captured operation authorities used by the public deploy boundary. */
export type DeploymentOperationResult = Effect.fn.Return<
  DeployExecutionResult,
  CliAdapterError,
  CliPulumi | CliDeployConfirmation | CliFileSystem
>;

/** Stable named declaration signature for the selected native event boundary. */
export type DeploymentOperation = (
  prepared: Prepared,
  handle: WorkspaceHandle,
  parsed: ParsedDeployArgs,
  events: Ref.Ref<readonly PulumiEvent[]>,
  onEvent: (event: PulumiEvent) => void,
) => Effect.Effect<
  DeployExecutionResult,
  CliAdapterError,
  CliPulumi | CliDeployConfirmation | CliFileSystem
>;
