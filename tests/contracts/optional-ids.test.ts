import { describe, expect, test } from "bun:test";
import { defineEnv } from "../../packages/config/src/index.ts";
import { defineApp } from "../../packages/app/src/index.ts";
import { defineBucket } from "../../packages/buckets/src/index.ts";
import { defineCache } from "../../packages/cache/src/index.ts";
import { defineEvent } from "../../packages/events/src/index.ts";
import { defineError, defineFunction } from "../../packages/functions/src/index.ts";
import { createUnboundIdentity, isUnboundIdentity } from "../../packages/invocation/src/index.ts";
import { defineJob } from "../../packages/jobs/src/index.ts";
import {
  defineMiddleware,
  defineRoute,
  defineTransform,
  http,
} from "../../packages/routes/src/index.ts";
import { defineService } from "../../packages/services/src/index.ts";
import { defineTool } from "../../packages/tools/src/index.ts";
import { defineAgent } from "../../packages/agents/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

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
    expect(() =>
      defineJob({
        input,
        target: defineFunction({
          id: "orders.target",
          input,
          output,
          handler: async () => ({ ok: true }),
        }),
        retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
      } as never),
    ).toThrow("Invalid stable ID");
    expect(() => defineBucket({ visibility: "private" } as never)).toThrow("Invalid stable ID");
    expect(() => defineCache({ key: input, value: output } as never)).toThrow("Invalid stable ID");
  });
});
