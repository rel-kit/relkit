import { describe, expect, test } from "bun:test";
import { CONFIG_CODES, ConfigValidationError, loadConfig, validateConfig } from "./src/index.ts";

describe("ZSYS configuration", () => {
  test("uses fixed project conventions and typed server defaults", () => {
    const input = {
      server: {
        port: 4100,
        maxBodyBytes: 2_000_000,
        apiDocs: { enabledInProduction: true },
      },
      inspector: { port: 4210 },
    } as const;
    const config = loadConfig(input, "/workspace/app");

    expect(config).toMatchObject({
      projectRoot: "/workspace/app",
      entry: "src/app.ts",
      source: ["src/**/*.ts"],
      generatedDirectory: ".zsys/generated",
      server: {
        port: 4100,
        maxBodyBytes: 2_000_000,
        apiDocs: { enabledInProduction: true },
      },
      inspector: { port: 4210 },
    });
    expect(config.exclude).toEqual(
      expect.arrayContaining(["src/**/*.test.ts", "src/**/*.d.ts", "src/**/__fixtures__/**"]),
    );
  });

  test("rejects legacy keys with direct migration guidance", () => {
    const issues = validateConfig(
      {
        entry: "custom.ts",
        source: ["lib/**/*.ts"],
        exclude: [],
        generatedDirectory: "build/generated",
      },
      "/workspace/app",
    );

    expect(issues.map(({ code }) => code)).toEqual([
      CONFIG_CODES.legacy,
      CONFIG_CODES.legacy,
      CONFIG_CODES.legacy,
      CONFIG_CODES.legacy,
    ]);
    expect(issues.map(({ message }) => message).join("\n")).toContain(
      'the application entry is always "src/app.ts"',
    );
    expect(() => loadConfig({ server: { port: 0 } }, "/workspace/app")).toThrow(
      ConfigValidationError,
    );
  });
});
