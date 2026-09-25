import { describe, expect, test } from "vitest";
import { readGolden } from "./test-support.js";
import {
  EnvResolutionError,
  defineEnv,
  env,
  isBindingValueRef,
  isEnvRef,
  projectEnv,
  resolveEnv,
} from "../src/index.js";

const secret = "synthetic-env-secret-2.10";

describe("@relkit/config environment", () => {
  test("keeps named binding values separate from application environment fields", () => {
    const cacheUrl = env.secret("CACHE_URL");
    const definition = defineEnv({ CACHE_URL: env.secret() });

    expect(cacheUrl).toEqual({
      kind: "binding-value-ref",
      name: "CACHE_URL",
      type: "secret-string",
      sensitive: true,
    });
    expect(Object.isFrozen(cacheUrl)).toBe(true);
    expect(isBindingValueRef(cacheUrl)).toBe(true);
    expect(isEnvRef(cacheUrl)).toBe(false);
    expect(isEnvRef(definition.CACHE_URL)).toBe(true);
    expect(isBindingValueRef(definition.CACHE_URL)).toBe(false);
    expect(() =>
      (defineEnv as (shape: Record<string, unknown>) => unknown)({ CACHE_URL: cacheUrl }),
    ).toThrow("Environment definitions must contain env builders");
  });

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
});
