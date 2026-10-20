import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { defineEnv, env, resolveEnv } from "../../packages/config/src/index.js";
import { SERVER_RUNTIME_SUPPORT_SOURCE } from "../../packages/cli/src/commands/build-server-runtime-support.js";

test("generated runtime uses decoded source values and defaults without changing the process source", () => {
  const definition = defineEnv({
    DAYS: env.number().default(7),
    ENABLED: env.boolean().default(true),
    ENDPOINT: env.url(),
    DEFAULT_DAYS: env.number().default(30),
  });
  const source = Object.freeze({
    DAYS: "7",
    ENABLED: "false",
    ENDPOINT: "http://localhost:3000",
    EXTRA: "kept",
  });
  const result = runInNewContext(
    `${SERVER_RUNTIME_SUPPORT_SOURCE}\nresolveRuntimeEnvironment(definition, "development", source)`,
    { resolveEnv, definition, source },
  );
  expect(result.error).toBeUndefined();
  expect(result.values.DAYS).toBe(7);
  expect(result.values.ENABLED).toBe(false);
  expect(result.values.ENDPOINT).toBeInstanceOf(URL);
  expect(result.values.DEFAULT_DAYS).toBe(30);
  expect(result.values.EXTRA).toBe("kept");
  expect(source.DAYS).toBe("7");
});

test("generated runtime retains invalid environment errors", () => {
  const result = runInNewContext(
    `${SERVER_RUNTIME_SUPPORT_SOURCE}\nresolveRuntimeEnvironment(definition, "development", source)`,
    { resolveEnv, definition: defineEnv({ DAYS: env.number() }), source: { DAYS: "invalid" } },
  );
  expect(result.error?.name).toBe("EnvResolutionError");
});
