/** Exercises readConfig's real metadata preflight before any module evaluation. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { readConfigEffect } from "../src/commands/check-input.js";
import { preflightSourceImports } from "../src/commands/check-dependencies.js";
import { capabilities, configFixture } from "./dependency-preflight.fixture.js";

test("missing native config peer is diagnosed before avoidable module evaluation", async () => {
  const fixture = await configFixture(
    "langchain",
    ["agent-execution", "agent-deep"],
    "agent-execution",
  );
  try {
    const result = await Effect.runPromise(
      readConfigEffect(fixture.root, {}, "missing-peer").pipe(
        Effect.provide(capabilities),
        Effect.catchTag("CliAdapterError", (error) => Effect.succeed(error)),
      ),
    );
    expect(result).toMatchObject({ _tag: "CliAdapterError" });
    expect(JSON.stringify(result)).toContain("RELKIT_DEPENDENCY_MISSING");
    expect(JSON.stringify(result)).not.toContain("AUTHORED CONFIG MUST NOT EVALUATE");
    expect(await readFile(join(fixture.root, "bun.lock"), "utf8")).toBe("unchanged lock bytes");
    expect(await readFile(join(fixture.root, "package.json"), "utf8")).toBe(
      '{"name":"config-preflight","private":true}',
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("an unused agent-state requirement does not block a multi-capability import", async () => {
  const fixture = await configFixture("redis", ["cache", "realtime", "agent-state"], "agent-state");
  try {
    await writeFile(join(fixture.directory, "index.js"), "export {};");
    const result = await Effect.runPromise(
      readConfigEffect(fixture.root, {}, "unused-peer").pipe(Effect.provide(capabilities)),
    );
    expect(result).toBeDefined();
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test.each([
  ["drizzle", "defineDrizzleService"],
  ["better-auth", "defineBetterAuthService"],
] as const)(
  "%s service peer is checked before authoring-only package evaluation",
  async (id, factory) => {
    const fixture = await configFixture(id, [], id);
    try {
      await writeFile(
        join(fixture.root, "relkit.config.ts"),
        `import {${factory} as selectedService} from "@relkit/${id}"; export default selectedService({});`,
      );
      const result = await Effect.runPromise(
        readConfigEffect(fixture.root, {}, "service-peer").pipe(
          Effect.provide(capabilities),
          Effect.catchTag("CliAdapterError", (error) => Effect.succeed(error)),
        ),
      );
      expect(result).toMatchObject({ _tag: "CliAdapterError" });
      expect(JSON.stringify(result)).toContain("RELKIT_DEPENDENCY_MISSING");
      expect(JSON.stringify(result)).not.toContain("AUTHORED CONFIG MUST NOT EVALUATE");
      expect(await readFile(join(fixture.root, "bun.lock"), "utf8")).toBe("unchanged lock bytes");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

test.each([
  ["runtime", "relkit.config.ts"],
  ["testing", "relkit.config.ts"],
  ["runtime", "custom.config.ts"],
  ["testing", "custom.config.ts"],
  ["runtime", "src/custom.config.test.ts"],
  ["testing", "src/custom.config.test.ts"],
  ["runtime", "src/__fixtures__/custom.config.ts"],
  ["testing", "src/__fixtures__/custom.config.ts"],
])(
  "configuration rejects the public %s namespace in %s before evaluation",
  async (namespace, configPath) => {
    const fixture = await configFixture("langchain", ["agent-execution"], "agent-execution");
    try {
      await mkdir(dirname(join(fixture.root, configPath)), { recursive: true });
      await writeFile(
        join(fixture.root, configPath),
        `import "@relkit/langchain/${namespace}"; export default {};`,
      );
      const result = await Effect.runPromise(
        readConfigEffect(fixture.root, { configPath }, "bad-role").pipe(
          Effect.provide(capabilities),
          Effect.catchTag("CliAdapterError", (error) => Effect.succeed(error)),
        ),
      );
      expect(JSON.stringify(result)).toContain("not an authoring export");
      expect(JSON.stringify(result)).not.toContain("AUTHORED CONFIG MUST NOT EVALUATE");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  },
);

test("an application testing helper retains native dependency preflight before evaluation", async () => {
  const fixture = await configFixture("langchain", ["agent-execution"], "agent-execution");
  try {
    const source = {
      fileName: "src/agent.ts",
      text: 'import { createTestModel } from "@relkit/langchain/testing"; export default createTestModel();',
    };
    const result = await Effect.runPromise(
      preflightSourceImports(fixture.root, [source]).pipe(
        Effect.provide(capabilities),
        Effect.catchTag("CliAdapterError", (error) => Effect.succeed(error)),
      ),
    );
    expect(JSON.stringify(result)).toContain("RELKIT_DEPENDENCY_MISSING");
    expect(JSON.stringify(result)).toContain("fixture-missing-sdk");
    expect(JSON.stringify(result)).not.toContain("AUTHORED CONFIG MUST NOT EVALUATE");
    expect(JSON.stringify(result)).not.toContain("not an authoring export");
    expect(await readFile(join(fixture.root, "bun.lock"), "utf8")).toBe("unchanged lock bytes");
    expect(await readFile(join(fixture.root, "package.json"), "utf8")).toBe(
      '{"name":"config-preflight","private":true}',
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("ordinary excluded test sources do not select native helpers or SDK requirements", async () => {
  const fixture = await configFixture("langchain", ["agent-execution"], "agent-execution");
  try {
    const result = await Effect.runPromise(
      preflightSourceImports(fixture.root, [
        {
          fileName: "src/agent.test.ts",
          text: 'import { createTestModel } from "@relkit/langchain/testing"; export default createTestModel();',
        },
      ]).pipe(Effect.provide(capabilities)),
    );
    expect(result).toEqual([]);
    expect(await readFile(join(fixture.root, "bun.lock"), "utf8")).toBe("unchanged lock bytes");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
