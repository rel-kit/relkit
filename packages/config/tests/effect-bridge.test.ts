import { describe, expect, test } from "vitest";
import { defineEnv, env } from "../src/index.js";
import { resolveEnvWithEffect } from "../src/internal/config.js";

describe("Effect config provider bridge", () => {
  test("resolves explicit provider values, preserving empty strings", async () => {
    const definition = defineEnv({ MODE: env.string(), EMPTY: env.string() });
    const resolved = await resolveEnvWithEffect(definition, { MODE: "test", EMPTY: "" }, "test");
    expect(resolved).toEqual({ MODE: "test", EMPTY: "" });
  });

  test("maps ordered domain issues to Config errors", async () => {
    const definition = defineEnv({ PORT_NUMBER: env.port(), MODE: env.string() });
    await expect(
      resolveEnvWithEffect(definition, { PORT_NUMBER: "70000" }, "production"),
    ).rejects.toThrow(/PORT_NUMBER|MODE/);
  });
});
