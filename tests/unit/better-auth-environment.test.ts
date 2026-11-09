/** The auth template's environment fails server startup with a coded error when either value is missing. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { defineEnv, env, resolveEnv } from "relkit/config";
import { SERVER_RUNTIME_SUPPORT_SOURCE } from "../../packages/cli/src/commands/build-server-runtime-support.js";

const root = resolve(import.meta.dir, "../..");

test("the auth template declares both Better Auth values without defaults", async () => {
  const source = await readFile(
    resolve(root, "packages/cli/src/scaffolding/render-auth.ts"),
    "utf8",
  );
  expect(source).toContain(
    'ensureEnvironmentEffect(builder, "BETTER_AUTH_SECRET", "env.secret()")',
  );
  expect(source).toContain('ensureEnvironmentEffect(builder, "BETTER_AUTH_URL", "env.url()"');
  expect(source).not.toContain("env.url().default(");
});

test("startup without BETTER_AUTH_SECRET or BETTER_AUTH_URL fails with RELKIT_ENVIRONMENT_INVALID", () => {
  const definition = defineEnv({ BETTER_AUTH_SECRET: env.secret(), BETTER_AUTH_URL: env.url() });
  const startup = (source: Record<string, string>) =>
    runInNewContext(
      `${SERVER_RUNTIME_SUPPORT_SOURCE}
      const resolution = resolveRuntimeEnvironment(definition, "production", source);
      ({ code: resolution.error === undefined ? undefined : errorCode(resolution.error), message: resolution.error?.message ?? "" })`,
      { resolveEnv, definition, source },
    ) as { readonly code?: string; readonly message: string };

  const missing = startup({});
  expect(missing.code).toBe("RELKIT_ENVIRONMENT_INVALID");
  expect(missing.message).toContain("BETTER_AUTH_SECRET");
  expect(missing.message).toContain("BETTER_AUTH_URL");
  expect(startup({ BETTER_AUTH_SECRET: "s".repeat(32) }).message).toContain("BETTER_AUTH_URL");
  expect(
    startup({ BETTER_AUTH_SECRET: "s".repeat(32), BETTER_AUTH_URL: "https://app.example" }).code,
  ).toBeUndefined();
});
