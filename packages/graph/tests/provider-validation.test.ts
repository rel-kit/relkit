import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { GraphValidationError } from "../src/index.js";
import { failValidation } from "../src/graph-validation-error.js";
import {
  validateDeploymentRolesEffect,
  validateProviderNode,
  validateProviderNodeEffect,
} from "../src/provider-validation.js";
import { providerNode } from "./graph-fixtures.js";
const base = providerNode();
const adapter = base.adapter as Record<string, unknown>;
const sensitive = { required: true, sensitive: true, authoredValue: "fixed" };
const namedValue = { field: "url", name: "CACHE_URL", type: "secret-string", sensitive: true };
function message(value: Record<string, unknown>): string {
  const error = Effect.runSync(Effect.flip(validateProviderNodeEffect(value, 0, failValidation)));
  expect(error).toBeInstanceOf(GraphValidationError);
  return error.message;
}
describe("provider projection validation", () => {
  test("accepts safe connected, named, and infrastructure providers", () => {
    expect(Effect.runSync(validateProviderNodeEffect(base, 0, failValidation))).toBeUndefined();
    const named = providerNode({
      adapter: { ...adapter, connectionContract: { url: sensitive } },
      namedValues: [namedValue],
    });
    expect(Effect.runSync(validateProviderNodeEffect(named, 0, failValidation))).toBeUndefined();
    const infrastructure = providerNode({
      providerSource: { kind: "infrastructure", integrationId: "aws", options: {} },
      deploymentRoles: [
        { role: "infrastructure", integrationId: "aws", protocolVersion: 1, configuration: {} },
      ],
    });
    expect(() => validateProviderNode(infrastructure, 0, failValidation)).not.toThrow();
  });
  test.each([
    [providerNode({ capability: "unknown" }), "provider metadata is invalid"],
    [providerNode({ profile: "" }), "provider metadata is invalid"],
    [providerNode({ ownership: "external" }), "provider metadata is invalid"],
    [providerNode({ adapter: null }), "provider metadata is invalid"],
    [
      providerNode({ adapter: { ...adapter, protocolVersion: 2 } }),
      "protocol version 2 is unsupported",
    ],
    [providerNode({ adapter: { ...adapter, integrationId: "" } }), ".adapter is invalid"],
    [providerNode({ adapter: { ...adapter, features: ["same", "same"] } }), ".adapter is invalid"],
    [
      providerNode({
        adapter: { ...adapter, connectionContract: { url: { ...sensitive, default: "secret" } } },
      }),
      ".connectionContract.url is invalid",
    ],
    [
      providerNode({ adapter: { ...adapter, connection: { unknown: "value" } } }),
      ".connection.unknown is invalid",
    ],
    [
      providerNode({
        adapter: {
          ...adapter,
          connectionContract: { url: sensitive },
          connection: { url: "secret" },
        },
      }),
      ".connection.url is invalid",
    ],
    [providerNode({ providerSource: { kind: "mystery" } }), ".providerSource is invalid"],
    [
      providerNode({ providerSource: { kind: "infrastructure", integrationId: "aws" } }),
      ".providerSource is invalid",
    ],
    [
      providerNode({
        adapter: { ...adapter, connectionContract: { url: sensitive } },
        namedValues: [{ ...namedValue, value: "secret" }],
      }),
      ".namedValues[0] is invalid",
    ],
    [
      providerNode({
        adapter: { ...adapter, connectionContract: { url: sensitive } },
        namedValues: [{ ...namedValue, sensitive: false }],
      }),
      "does not match its contract",
    ],
    [
      providerNode({
        adapter: { ...adapter, connectionContract: { url: sensitive } },
        namedValues: [namedValue, namedValue],
      }),
      "does not match its contract",
    ],
    [
      providerNode({ local: { integrationId: "docker", recipeId: "redis", recipeVersion: 0 } }),
      ".local is invalid",
    ],
    [
      providerNode({
        providerSource: { kind: "infrastructure", integrationId: "aws", options: {} },
      }),
      "roles do not match",
    ],
    [providerNode({ access: {} }), "roles do not match"],
  ])("rejects unsafe provider projection %#", (value, expected) => {
    expect(message(value)).toContain(expected);
    expect(() => validateProviderNode(value, 0, failValidation)).toThrow(TypeError);
  });
  test("validates role ownership, protocol, and duplicates", () => {
    const role = { role: "engine", integrationId: "aws", protocolVersion: 1, configuration: {} };
    const invalid = [
      [null, "deploymentRoles is invalid"],
      [[{ ...role, protocolVersion: 2 }], "protocol version 2 is unsupported"],
      [[{ ...role, role: "access" }], "invalid role"],
      [[{ ...role, configuration: undefined, integrationId: "" }], "is invalid"],
      [[role, role], "duplicate engine"],
    ] as const;
    for (const [roles, expected] of invalid) {
      const error = Effect.runSync(
        Effect.flip(validateDeploymentRolesEffect(roles, 0, "app", failValidation)),
      );
      expect(error.message).toContain(expected);
    }
    expect(
      Effect.runSync(validateDeploymentRolesEffect(undefined, 0, "app", failValidation)),
    ).toBeUndefined();
  });
});
