import type { ProviderBindingNode, ProviderCapability } from "@relkit/graph";
import type { InvocationTarget } from "../src/invoke-types.js";
import type { FunctionHandler } from "../src/registry.types.js";

/** Validate a dynamically loaded descriptor without replacing its identity. */
export function invocationTarget(value: unknown): InvocationTarget {
  if (!isTarget(value)) throw new TypeError("Expected an invocation descriptor");
  return value;
}

function isTarget(value: unknown): value is InvocationTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "handler" in value &&
    typeof value.handler === "function" &&
    "input" in value &&
    "output" in value
  );
}

/** Manifest loaders accept callable values whose schemas enforce argument types. */
export function runtimeHandler(value: unknown): FunctionHandler {
  if (!isHandler(value)) throw new TypeError("Expected a manifest handler");
  return value;
}

function isHandler(value: unknown): value is FunctionHandler {
  return typeof value === "function";
}

/** Complete metadata for an in-memory event-provider fixture. */
export function providerBinding(
  capability: ProviderCapability,
  profile: string,
): ProviderBindingNode {
  return {
    kind: "provider",
    id: `providers.${capability}.${profile}`,
    capability,
    profile,
    source: { file: "src/providers.ts", line: 1, column: 1 },
    adapter: {
      integrationId: "test",
      adapterId: "memory",
      protocolVersion: 1,
      behavior: null,
      connectionContract: {},
      connection: {},
      features: [],
    },
    providerSource: { kind: "local-only" },
    namedValues: [],
    deploymentRoles: [],
  };
}
