import type { JsonValue } from "@relkit/contracts";
import type { GraphNodeBase } from "./model.js";
import type { DeploymentRoleProjection } from "./provider-nodes.js";

/**
 * Application root with deployment and telemetry metadata.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: AppNode): void => { console.log(value); };
 */
export interface AppNode extends GraphNodeBase<"app"> {
  readonly environment?: JsonValue;
  readonly telemetry?: JsonValue;
  readonly defaults?: JsonValue;
  readonly deploymentRoles?: readonly DeploymentRoleProjection[];
}

/**
 * Declared environment variable dependency.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: EnvironmentVariableNode): void => { console.log(value); };
 */
export interface EnvironmentVariableNode extends GraphNodeBase<"env"> {
  readonly name: string;
  readonly type: string;
  readonly requiredIn: readonly string[];
  readonly hasDefault: boolean;
  readonly sensitive: boolean;
  readonly description?: string;
}

/**
 * Identity of a function generated for an agent.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: GeneratedAgentMarker): void => { console.log(value); };
 */
export interface GeneratedAgentMarker {
  readonly generated: true;
  readonly generatedBy: "agent";
  readonly agentId: string;
  readonly functionId: string;
}

/**
 * Alias for generated agent function identity.
 * @remarks IDs and source locations follow the versioned graph contract.
 * @example const inspect = (value: GeneratedFunctionMarker): void => { console.log(value); };
 */
export type GeneratedFunctionMarker = GeneratedAgentMarker;
