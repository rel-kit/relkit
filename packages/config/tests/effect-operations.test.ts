import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { defineEnvEffect, env, projectEnvEffect, resolveEnvEffect } from "../src/index.js";
import { parseJsonEffect, parseUrlEffect } from "../src/env-factory.js";
import { toJsonValue, toJsonValueEffect } from "../src/env-json.js";
import {
  parseBooleanEffect,
  parseLiteralEffect,
  parseNumberEffect,
  parsePortEffect,
} from "../src/env-parsers.js";

describe("config Effect operations", () => {
  test("declaration and resolution expose typed errors", () => {
    const invalid = Effect.runSync(
      Effect.catchTag(defineEnvEffect({ VALUE: {} } as never), "ConfigValidationError", (error) =>
        Effect.succeed(error.message),
      ),
    );
    expect(invalid).toBe("Environment definitions must contain env builders");
    for (const field of [null, undefined]) {
      expect(
        Effect.runSync(
          Effect.catchTag(
            defineEnvEffect({ VALUE: field } as never),
            "ConfigValidationError",
            (error) => Effect.succeed(error.message),
          ),
        ),
      ).toBe("Environment definitions must contain env builders");
    }
    expect(
      Effect.runSync(
        Effect.catchTag(defineEnvEffect(null as never), "ConfigValidationError", (error) =>
          Effect.succeed(error.message),
        ),
      ),
    ).toBe("Environment definitions must contain env builders");
    expect(
      Effect.runSync(
        Effect.catchTag(
          defineEnvEffect({ PORT: env.port() } as never),
          "ConfigValidationError",
          (error) => Effect.succeed(error.message),
        ),
      ),
    ).toContain("framework-reserved");
    expect(
      Effect.runSync(
        Effect.catchTag(
          defineEnvEffect({ kind: env.string() } as never),
          "ConfigValidationError",
          (error) => Effect.succeed(error.message),
        ),
      ),
    ).toContain("reserved");

    const definition = Effect.runSync(defineEnvEffect({ MODE: env.string() }));
    expect(Effect.runSync(projectEnvEffect(definition))[0]?.name).toBe("MODE");
    expect(
      Effect.runSync(
        resolveEnvEffect(definition, {
          environment: "test",
          source: { MODE: "ready" },
        }),
      ).MODE,
    ).toBe("ready");
    const missing = Effect.runSync(
      Effect.catchTag(
        resolveEnvEffect(definition, { environment: "test", source: {} }),
        "EnvResolutionError",
        (error) => Effect.succeed(error.issues[0]?.code),
      ),
    );
    expect(missing).toBe("missing");
    expect(
      Effect.runSync(
        Effect.catchTag(projectEnvEffect({} as never), "ConfigValidationError", (error) =>
          Effect.succeed(error.message),
        ),
      ),
    ).toBe("Expected an environment definition");
  });

  test("parser Effects report stable failures and preserve adapters", () => {
    expect(Effect.runSync(parseNumberEffect(" 2 "))).toBe(2);
    expect(Effect.runSync(parsePortEffect("3210"))).toBe(3210);
    expect(Effect.runSync(parseBooleanEffect("false"))).toBe(false);
    expect(Effect.runSync(parseBooleanEffect("true"))).toBe(true);
    expect(Effect.runSync(parseLiteralEffect("2", [1, 2]))).toBe(2);
    expect(
      Effect.runSync(
        Effect.catchTag(parseNumberEffect(" "), "ConfigValidationError", (error) =>
          Effect.succeed(error.message),
        ),
      ),
    ).toBe("Expected a finite number");
    expect(
      Effect.runSync(
        Effect.catchTag(parsePortEffect("65536"), "ConfigValidationError", (error) =>
          Effect.succeed(error.message),
        ),
      ),
    ).toContain("1 through 65535");
    expect(
      Effect.runSync(
        Effect.catchTag(parseBooleanEffect("TRUE"), "ConfigValidationError", (error) =>
          Effect.succeed(error.message),
        ),
      ),
    ).toBe("Expected true or false");
    expect(
      Effect.runSync(
        Effect.catchTag(parseLiteralEffect("x", ["a", "b"]), "ConfigValidationError", (error) =>
          Effect.succeed(error.message),
        ),
      ),
    ).toBe("Expected one of: a, b");
    expect(env.number().parse("3")).toBe(3);
    expect(() => env.number().parse("no")).toThrow(TypeError);
    expect(env.port().parse("80")).toBe(80);
    expect(env.string().parse("ready")).toBe("ready");
    expect(env.secret().parse("token")).toBe("token");
    expect(env.literal("test", "prod").parse("test")).toBe("test");
    expect(() => env.boolean().parse("no")).toThrow(TypeError);
  });

  test("JSON and URL Effects handle supported values and tagged invalid input", () => {
    expect(Effect.runSync(toJsonValueEffect(-0))).toBe(0);
    expect(Effect.runSync(toJsonValueEffect(new URL("https://example.test")))).toBe(
      "https://example.test/",
    );
    expect(Effect.runSync(toJsonValueEffect([null, true, { count: 2 }]))).toEqual([
      null,
      true,
      { count: 2 },
    ]);
    for (const value of [Infinity, undefined, Symbol("x"), new Date()]) {
      expect(
        Effect.runSync(
          Effect.catchTag(toJsonValueEffect(value), "ConfigValidationError", (error) =>
            Effect.succeed(error._tag),
          ),
        ),
      ).toBe("ConfigValidationError");
    }
    expect(
      Effect.runSync(
        Effect.catchTag(
          toJsonValueEffect({
            get bad() {
              return 1;
            },
          }),
          "ConfigValidationError",
          (error) => Effect.succeed(error.message),
        ),
      ),
    ).toBe("Examples cannot contain accessors");
    expect(() => toJsonValue({ bad: Infinity })).toThrow(TypeError);
    expect(Effect.runSync(parseJsonEffect('{"enabled":true}'))).toEqual({ enabled: true });
    expect(Effect.runSync(parseUrlEffect("https://example.test")).hostname).toBe("example.test");
    expect(
      Effect.runSync(
        Effect.catchTag(parseJsonEffect("{"), "ConfigValidationError", (error) =>
          Effect.succeed(error._tag),
        ),
      ),
    ).toBe("ConfigValidationError");
    expect(
      Effect.runSync(
        Effect.catchTag(parseUrlEffect("bad"), "ConfigValidationError", (error) =>
          Effect.succeed(error._tag),
        ),
      ),
    ).toBe("ConfigValidationError");
    expect(env.json().parse("[1,2]")).toEqual([1, 2]);
    expect(() => env.json().parse("{")).toThrow(SyntaxError);
    expect(() => env.url().parse("bad")).toThrow(TypeError);
  });
});
