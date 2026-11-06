import { langchain } from "@relkit/langchain";
import { describe, expect, test } from "bun:test";
import { defineEnv } from "relkit/config";
import { defineApp } from "relkit";
import { defineBucket } from "relkit/buckets";
import { defineCache } from "relkit/cache";
import { defineEvent } from "relkit/events";
import { defineError, defineFunction } from "relkit/functions";
import { createUnboundIdentity, isUnboundIdentity } from "relkit/invocation";
import { defineMiddleware, defineRoute, defineTransform, http } from "relkit/routes";
import { defineService } from "relkit/services";
import { defineTool } from "relkit/tools";
import { defineAgent } from "relkit/agents";
import { z } from "relkit/schema";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });

describe("optional authoring IDs", () => {
  test("uses process-local unbound identities for eligible factories", () => {
    const target = defineFunction({
      input,
      output,
      handler: async () => ({ ok: true }),
    });
    const error = defineError({ data: input, message: "Invalid", retry: "never" });
    const route = defineRoute({ target });
    const middleware = defineMiddleware("/orders/*", async (_context, next) => next());
    const transform = defineTransform({ schema: z.string() });
    const service = defineService({ functions: { get: target } });
    const tool = defineTool({
      target,
      description: "Read an order",
      sideEffect: "read",
      approval: "never",
    });
    const derivedTool = target.asTool({
      description: "Read an order",
      sideEffect: "read",
      approval: "never",
    });
    const agent = defineAgent({
      runtime: langchain(),
      input,
      output,
      model: "default",
      instructions: "Answer safely.",
      tools: [tool],
      limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    });

    const identities = [
      target.id,
      error.id,
      route.id,
      middleware.id,
      transform.id,
      service.id,
      tool.id,
      derivedTool.id,
      agent.id,
    ];
    expect(identities.every(isUnboundIdentity)).toBe(true);
    expect(new Set(identities).size).toBe(identities.length);
    expect(target.ref.id).toBe(target.id);
    expect(service.ref.id).toBe(service.id);
    expect(service.get).toBe(target);
    expect(createUnboundIdentity()).not.toBe(target.id);
  });

  test("keeps durable identities mandatory at runtime", () => {
    expect(defineApp({ env: defineEnv({}) }).kind).toBe("app");
    expect(() => defineEvent({ version: 1, input } as never)).toThrow("Invalid stable ID");
    expect(() => defineBucket({ visibility: "private" } as never)).toThrow("Invalid stable ID");
    expect(() => defineCache({ key: input, value: output } as never)).toThrow("Invalid stable ID");
  });
});
