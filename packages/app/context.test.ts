import { expect, test } from "bun:test";
import { defineEnv, env } from "@relkit/config";
import { createApplicationContextResolver } from "./src/context-resolver.ts";
import { defineConstants, definePrompt } from "./src/context-descriptors.ts";

const noop = (): void => undefined;
const log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop };

test("caches static context values and resolves dynamic constants concurrently per invocation", async () => {
  const definition = defineEnv({ REGION: env.string() });
  const started: string[] = [];
  let calls = 0;
  const constants = defineConstants({
    literal: { enabled: true },
    region: definition.REGION,
    first: async () => {
      started.push("first");
      calls += 1;
      await Promise.resolve();
      return calls;
    },
    second: async () => {
      started.push("second");
      return "ready";
    },
  });
  const resolver = createApplicationContextResolver({
    constants: { application: constants },
    prompts: { support: definePrompt(["Be concise.", "Use tools."]) },
    env: { REGION: "eu-west-1" },
  });
  const context = { signal: new AbortController().signal, log };
  const first = await resolver.resolve(context);
  const second = await resolver.resolve(context);

  expect(started.slice(0, 2)).toEqual(["first", "second"]);
  expect(first.constants).toMatchObject({
    literal: { enabled: true },
    region: "eu-west-1",
    second: "ready",
  });
  expect(second.constants.first).not.toBe(first.constants.first);
  expect(first.prompts.support).toEqual(["Be concise.", "Use tools."]);
});

test("rejects invalid prompts and duplicate constant keys", () => {
  expect(() => definePrompt([])).toThrow("nonempty text");
  expect(() =>
    createApplicationContextResolver({
      constants: {
        first: defineConstants({ duplicate: 1 }),
        second: defineConstants({ duplicate: 2 }),
      },
      env: {},
    }),
  ).toThrow('Constant "duplicate" is registered more than once');
});
