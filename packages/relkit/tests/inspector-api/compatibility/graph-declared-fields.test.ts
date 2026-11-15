/**
 * Declared fields that Inspector detail pages display must survive the graph projection
 * unchanged: channel partition parameters, replay window and presence, and an agent's
 * model source and instructions (IN-07).
 */
import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "relkit/contracts";
import { projectNode } from "../../../src/inspector-api/graph-utils.ts";
import { json, makeApp } from "./contracts-fixtures.ts";

describe("graph projection of declared fields", () => {
  test("channel detail keeps params, replay and presence", async () => {
    const { app } = makeApp();
    const body = await json<{ descriptor: Record<string, unknown> }>(
      app,
      API_BASE_PATH + "/channels/orders.updates",
    );
    expect(body.descriptor).toMatchObject({
      params: {
        type: "object",
        properties: { companyId: { type: "string" } },
        required: ["companyId"],
      },
      replay: { retentionMs: 300_000, maxEvents: 500 },
      presence: { kind: "count" },
    });
  });

  test("agent detail keeps its model source and instructions", async () => {
    const { app } = makeApp();
    const body = await json<{ descriptor: Record<string, unknown> }>(
      app,
      API_BASE_PATH + "/agents/orders.agent",
    );
    expect(body.descriptor).toMatchObject({
      modelSource: "native",
      instructions: "Answer order questions.",
    });
  });

  test("a function keeps its access rule, so a guarded route does not read as public", () => {
    const node = projectNode({
      kind: "function",
      id: "fleet.list-vehicles",
      access: { permissions: ["vehicle:read"], predicate: true },
    });
    expect(node).toMatchObject({
      access: { permissions: ["vehicle:read"], predicate: true },
    });
    expect(projectNode({ kind: "function", id: "hello.greet" })).not.toHaveProperty("access");
  });
});
