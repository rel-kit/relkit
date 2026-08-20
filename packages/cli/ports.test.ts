import { describe, expect, test } from "bun:test";
import { resolveApplicationPort, resolveInspectorPort } from "./src/commands/ports.ts";

describe("framework port precedence", () => {
  test("resolves application flag, environment, config, and default in order", () => {
    expect(resolveApplicationPort({ flag: 4001, source: { PORT: "4002" }, configured: 4003 })).toBe(
      4001,
    );
    expect(resolveApplicationPort({ source: { PORT: "4002" }, configured: 4003 })).toBe(4002);
    expect(resolveApplicationPort({ source: {}, configured: 4003 })).toBe(4003);
    expect(resolveApplicationPort({ source: {} })).toBe(3000);
  });

  test("resolves inspector precedence and rejects invalid environment values", () => {
    expect(
      resolveInspectorPort({
        flag: 4201,
        source: { ZSYS_INSPECTOR_PORT: "4202" },
        configured: 4203,
      }),
    ).toBe(4201);
    expect(
      resolveInspectorPort({ source: { ZSYS_INSPECTOR_PORT: "4202" }, configured: 4203 }),
    ).toBe(4202);
    expect(resolveInspectorPort({ source: {}, configured: 4203 })).toBe(4203);
    expect(resolveInspectorPort({ source: {} })).toBe(3210);
    expect(() => resolveApplicationPort({ source: { PORT: "invalid" } })).toThrow("PORT");
    expect(() => resolveInspectorPort({ source: { ZSYS_INSPECTOR_PORT: "0" } })).toThrow(
      "ZSYS_INSPECTOR_PORT",
    );
  });
});
