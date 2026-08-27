import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EnvResolutionError,
  defineEnv,
  env,
  projectEnv,
  resolveEnv,
} from "../../packages/config/src/index.ts";

const secret = "synthetic-env-secret-2.10";

function readGolden(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dir, "golden", name), "utf8"));
}

function assertSecretAbsent(value: unknown, forbidden: string, seen = new WeakSet<object>()): void {
  if (typeof value === "string") {
    expect(value).not.toContain(forbidden);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertSecretAbsent(item, forbidden, seen);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    expect(key).not.toContain(forbidden);
    assertSecretAbsent(item, forbidden, seen);
  }
}

describe.serial("@relkit/config environment", () => {
  test("reserves PORT for framework server selection", () => {
    const unsafeDefineEnv = defineEnv as (shape: Record<string, unknown>) => unknown;
    expect(() => unsafeDefineEnv({ PORT: env.port() })).toThrow(
      'Environment variable name "PORT" is framework-reserved; configure server.port instead.',
    );
  });

  test("reserves RELKIT_ENV for framework runtime selection", () => {
    const unsafeDefineEnv = defineEnv as (shape: Record<string, unknown>) => unknown;
    expect(() => unsafeDefineEnv({ RELKIT_ENV: env.string() })).toThrow(
      'Environment variable name "RELKIT_ENV" is framework-reserved.',
    );
  });

  test("resolves defaults and environment-specific requirements", () => {
    const definition = defineEnv({
      requiredOnlyInProduction: env.string().requiredIn("production"),
      optionalValue: env.string().optional(),
      defaultValue: env.number().default(3210),
    });

    expect(resolveEnv(definition, { environment: "development", source: {} })).toEqual({
      requiredOnlyInProduction: undefined,
      optionalValue: undefined,
      defaultValue: 3210,
    });
    expect(() => resolveEnv(definition, { environment: "production", source: {} })).toThrow(
      "requiredOnlyInProduction: Required value is missing",
    );
    expect(
      resolveEnv(definition, {
        environment: "production",
        source: { requiredOnlyInProduction: "ready" },
      }),
    ).toEqual({
      requiredOnlyInProduction: "ready",
      optionalValue: undefined,
      defaultValue: 3210,
    });
  });

  test("reports malformed values without exposing source values", () => {
    const definition = defineEnv({
      count: env.number(),
      enabled: env.boolean(),
      port: env.port(),
      endpoint: env.url(),
      settings: env.json(),
      mode: env.literal("development", "production"),
    });

    let error: unknown;
    try {
      resolveEnv(definition, {
        environment: "test",
        source: {
          count: "not-a-number",
          enabled: "maybe",
          port: "70000",
          endpoint: "not-a-url",
          settings: "{broken",
          mode: "staging",
        },
      });
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(EnvResolutionError);
    const issues = (error as EnvResolutionError).issues;
    expect(issues.map(({ name, code, sensitive }) => ({ name, code, sensitive }))).toEqual([
      { name: "count", code: "invalid", sensitive: false },
      { name: "enabled", code: "invalid", sensitive: false },
      { name: "port", code: "invalid", sensitive: false },
      { name: "endpoint", code: "invalid", sensitive: false },
      { name: "settings", code: "invalid", sensitive: false },
      { name: "mode", code: "invalid", sensitive: false },
    ]);
    expect(JSON.stringify(error)).not.toContain("not-a-number");
    expect(JSON.stringify(error)).not.toContain("{broken");
  });

  test("deep-freezes resolved values, including parsed JSON", () => {
    const definition = defineEnv({
      settings: env.json(),
      label: env.string(),
    });
    const resolved = resolveEnv(definition, {
      environment: "test",
      source: { settings: '{"nested":{"enabled":true}}', label: "ready" },
    });

    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.settings)).toBe(true);
    expect(Object.isFrozen(resolved.settings.nested)).toBe(true);
    const mutable = resolved as {
      settings: { nested: { enabled: boolean } };
      label: string;
    };
    expect(() => {
      mutable.settings.nested.enabled = false;
      mutable.label = "changed";
    }).toThrow(TypeError);
    expect(resolved).toEqual({
      settings: { nested: { enabled: true } },
      label: "ready",
    });
  });

  test("projects deterministic JSON-safe graph metadata", () => {
    const definition = defineEnv({
      API_KEY: env
        .secret()
        .default(secret)
        .requiredIn("production")
        .description("External API key")
        .example(secret),
      APP_ENV: env
        .literal("development", "production")
        .default("development")
        .requiredIn("production")
        .description("Application environment")
        .example("development"),
      OPTIONAL_URL: env.url().optional().example(new URL("https://example.test")),
      SERVICE_PORT: env.port().default(3210).description("Upstream service port"),
    });
    const projection = projectEnv(definition);

    expect(projection).toEqual(readGolden("environment.json"));
    expect(projection.map(({ name }) => name)).toEqual([
      "API_KEY",
      "APP_ENV",
      "OPTIONAL_URL",
      "SERVICE_PORT",
    ]);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(JSON.parse(JSON.stringify(projection))).toEqual(projection);
  });

  test("does not read process or files while evaluating a declaration", async () => {
    const processEnv = Object.getOwnPropertyDescriptor(process, "env");
    const originalFile = Bun.file;
    let processReads = 0;
    let fileReads = 0;
    Object.defineProperty(process, "env", {
      ...processEnv,
      value: new Proxy(process.env, {
        get() {
          processReads += 1;
          throw new Error("process.env was read during declaration");
        },
      }),
    });
    Bun.file = ((..._args: Parameters<typeof Bun.file>) => {
      fileReads += 1;
      throw new Error("Bun.file was read during declaration");
    }) as typeof Bun.file;

    try {
      const { valueFreeDeclaration } = await import("./fixtures/value-free-declaration.ts");
      expect(valueFreeDeclaration.kind).toBe("env-definition");
    } finally {
      if (processEnv) Object.defineProperty(process, "env", processEnv);
      Bun.file = originalFile;
    }

    expect(processReads).toBe(0);
    expect(fileReads).toBe(0);
    for (const source of ["env.ts", "env-json.ts", "index.ts", "resolve.ts"]) {
      const contents = readFileSync(
        join(import.meta.dir, "../../packages/config/src", source),
        "utf8",
      );
      expect(contents).not.toMatch(/node:(?:fs|process)|\b(?:process|Bun\.file|readFile)\b/);
    }
  });

  test("recursively keeps secret values and defaults out of metadata and snapshots", () => {
    const definition = defineEnv({
      apiKey: env.secret().default(secret).example(secret),
      nestedDefault: env.json().default({ credentials: { token: secret } }),
      requiredSecret: env.secret().requiredIn("production"),
    });
    const projection = projectEnv(definition);
    const golden = readGolden("environment.json");
    const snapshot = JSON.parse(JSON.stringify({ metadata: definition.metadata, projection }));

    assertSecretAbsent(definition.metadata, secret);
    assertSecretAbsent(projection, secret);
    assertSecretAbsent(golden, secret);
    assertSecretAbsent(snapshot, secret);
    expect(JSON.stringify(definition)).not.toContain(secret);
    expect(projection.find(({ name }) => name === "apiKey")).toMatchObject({
      sensitive: true,
      hasDefault: true,
      example: "[redacted]",
    });
    expect(() => resolveEnv(definition, { environment: "production", source: {} })).toThrow(
      "requiredSecret: Required value is missing",
    );
  });
});
