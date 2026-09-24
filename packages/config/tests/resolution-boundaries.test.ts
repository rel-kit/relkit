import { describe, expect, test } from "vitest";
import { Cause, Effect, Exit } from "effect";
import { defineEnv, env, projectEnv, resolveEnv, resolveEnvEffect } from "../src/index.js";
import { createEnvBuilder } from "../src/env-builder.js";
import { createEnvRef } from "../src/env-ref.js";
import { resolveEnvWithEffectEffect } from "../src/internal/config.js";
import { resolveField } from "../src/resolve-helpers.js";

describe("environment resolution boundaries", () => {
  test("validates malformed definitions and explicit sources", () => {
    const definition = defineEnv({ MODE: env.string() });
    expect(() => projectEnv({ kind: "env-definition", shape: { BAD: {} } } as never)).toThrow(
      "Environment definitions must contain env builders",
    );
    for (const options of [
      { environment: "", source: {} },
      { environment: "test", source: null },
      { environment: "test", source: { MODE: 4 } },
    ]) {
      expect(() => resolveEnv(definition, options as never)).toThrow(TypeError);
      expect(
        Effect.runSync(
          Effect.catchTag(
            resolveEnvEffect(definition, options as never),
            "ConfigValidationError",
            (error) => Effect.succeed(error._tag),
          ),
        ),
      ).toBe("ConfigValidationError");
    }
    expect(
      Effect.runSync(
        Effect.catchTag(
          resolveEnvEffect({} as never, { environment: "test", source: {} }),
          "ConfigValidationError",
          (error) => Effect.succeed(error.message),
        ),
      ),
    ).toBe("Expected an environment definition");
  });

  test("handles parser omissions and default factory failures in field order", () => {
    const omitted = createEnvBuilder("string", () => undefined as never);
    const defaultFailure = env.string().default(() => {
      throw new Error("private default");
    });
    const definition = defineEnv({ OMITTED: omitted, DEFAULT: defaultFailure });
    let error: unknown;
    try {
      resolveEnv(definition, { environment: "test", source: { OMITTED: "raw" } });
    } catch (cause) {
      error = cause;
    }
    expect(error).toMatchObject({
      _tag: "EnvResolutionError",
      issues: [
        { name: "OMITTED", message: "Parser returned no value" },
        { name: "DEFAULT", message: "Default value could not be produced" },
      ],
    });
  });

  test("redacts parser failures and handles unexpected parser throws", () => {
    const privateField = createEnvBuilder(
      "secret-string",
      () => {
        throw new Error("private text");
      },
      true,
    );
    const unknownField = createEnvBuilder("string", () => {
      throw "unexpected";
    });
    const definition = defineEnv({ PRIVATE: privateField, UNKNOWN: unknownField });
    const result = Effect.runSync(
      Effect.catchTag(
        resolveEnvEffect(definition, {
          environment: "test",
          source: { PRIVATE: "secret", UNKNOWN: "raw" },
        }),
        "EnvResolutionError",
        (error) => Effect.succeed(error.issues),
      ),
    );
    expect(result).toEqual([
      { name: "PRIVATE", code: "invalid", message: "Value is invalid", sensitive: true },
      { name: "UNKNOWN", code: "invalid", message: "Value is invalid", sensitive: false },
    ]);
  });

  test("covers synchronous builder and reference adapters", () => {
    const builder = createEnvBuilder("string", (value) => value);
    expect(builder.kind).toBe("env-builder");
    const ref = createEnvRef("MODE", builder);
    expect(ref.name).toBe("MODE");
  });

  test("guards a field even when called below source validation", () => {
    const issues: import("../src/resolve.types.js").EnvIssue[] = [];
    resolveField("MODE", env.string(), { MODE: 2 } as never, "test", {}, issues);
    expect(issues).toEqual([
      {
        name: "MODE",
        code: "invalid",
        message: "Expected a string value",
        sensitive: false,
      },
    ]);
  });

  test("maps malformed bridge options into Config failure", () => {
    const definition = defineEnv({ MODE: env.string() });
    const result = Effect.runSyncExit(resolveEnvWithEffectEffect(definition, {}, ""));
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result))
      expect(Cause.squash(result.cause)).toMatchObject({ _tag: "ConfigError" });
  });
});
