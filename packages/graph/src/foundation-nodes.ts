import type { JsonValue } from "@relkit/contracts";
import type { GraphNodeBase } from "./model.js";
import type { DeploymentRoleProjection } from "./provider-nodes.js";

export interface AppNode extends GraphNodeBase<"app"> {
  readonly environment?: JsonValue;
  readonly telemetry?: JsonValue;
  readonly defaults?: JsonValue;
  readonly deploymentRoles?: readonly DeploymentRoleProjection[];
}

export interface EnvironmentVariableNode extends GraphNodeBase<"env"> {
  readonly name: string;
  readonly type: string;
  readonly requiredIn: readonly string[];
  readonly hasDefault: boolean;
  readonly sensitive: boolean;
  readonly description?: string;
}

export interface GeneratedAgentMarker {
  readonly generated: true;
  readonly generatedBy: "agent";
  readonly agentId: string;
  readonly functionId: string;
}

export type GeneratedFunctionMarker = GeneratedAgentMarker;
