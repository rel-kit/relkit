import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { ConfigValidationError, defineEnv, env } from "../src/index.js";
import { createEnvBuilderEffect, parseEnvBuilderEffect } from "../src/env-builder.js";
import { bindingOrBuilderEffect, literalBuilderEffect } from "../src/env-factory.js";
import { createEnvRefEffect, isEnvRefEffect } from "../src/env-ref.js";

describe("environment builder Effect operations", () => {
  test("fluent methods and references preserve compatibility", () => {
    const builder = Effect.runSync(createEnvBuilderEffect("string", (value) => value));
    expect(Effect.runSync(parseEnvBuilderEffect(Number, "2"))).toBe(2);
    expect(builder.optional().metadata.optional).toBe(true);
    expect(builder.default("x").getDefault()).toBe("x");
    expect(builder.default(() => "y").getDefault()).toBe("y");
    expect(builder.requiredIn("test", "test").metadata.requiredIn).toEqual(["test"]);
    expect(builder.description("Mode").metadata.description).toBe("Mode");
    expect(builder.example("demo").metadata.example).toBe("demo");
    expect(() => builder.requiredIn("")).toThrow("Environment names must not be empty");
    expect(Effect.runSync(literalBuilderEffect("test", "prod")).parse("prod")).toBe("prod");
    expect(
      Effect.runSync(
        Effect.catchTag(literalBuilderEffect(Infinity), "ConfigValidationError", (error) =>
          Effect.succeed(error.message),
        ),
      ),
    ).toBe("Literal values must be finite");
    expect(Effect.runSync(bindingOrBuilderEffect(undefined, "string", (value) => value)).kind).toBe(
      "env-builder",
    );
    expect(Effect.runSync(bindingOrBuilderEffect("CACHE", "string", (value) => value)).kind).toBe(
      "binding-value-ref",
    );
    for (const ref of [
      env.string("S"),
      env.number("N"),
      env.boolean("B"),
      env.port("P"),
      env.url("U"),
      env.json("J"),
      env.secret("TOKEN"),
    ])
      expect(ref.kind).toBe("binding-value-ref");
    const ref = Effect.runSync(createEnvRefEffect("MODE", builder));
    expect(Effect.runSync(isEnvRefEffect(ref))).toBe(true);
    expect(Effect.runSync(isEnvRefEffect({ kind: "env-ref" }))).toBe(false);
    expect(defineEnv({ MODE: env.string() }).MODE.name).toBe("MODE");
    expect(new ConfigValidationError({ message: "invalid" })._tag).toBe("ConfigValidationError");
  });
});
