import type { JsonValue } from "@relkit/contracts";
import type { GraphNodeBase } from "./model.js";

export interface AppNode extends GraphNodeBase<"app"> {
  readonly environment?: JsonValue;
  readonly providerBindings?: readonly string[];
  readonly observability?: JsonValue;
  readonly defaults?: JsonValue;
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
