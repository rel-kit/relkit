/**
 * Exercises application inspection selection through its public constructor.
 * Configuration selects only a development bridge; malformed or
 * obsolete settings must fail before a development session acquires resources.
 */
import { expect, test } from "vitest";
import { defineEnv } from "@relkit/config";
import { defineApp } from "../src/define-app.js";

test("omitted and explicitly disabled inspection remain disabled", () => {
  for (const inspector of [undefined, { enabled: false }]) {
    const app = defineApp({ env: defineEnv({}), ...(inspector ? { inspector } : {}) });
    expect(app.inspector?.enabled ?? false).toBe(false);
    if (inspector === undefined) expect(app.inspector).toBeUndefined();
    else
      expect(app.inspector).toEqual({
        enabled: false,
        connection: { host: "127.0.0.1", port: 0 },
        maxPreviewBytes: 1_048_576,
      });
  }
});

test("explicit enablement selects an ephemeral loopback bridge without tool configuration", () => {
  const app = defineApp({ env: defineEnv({}), inspector: { enabled: true } });
  expect(app.inspector).toEqual({
    enabled: true,
    connection: { host: "127.0.0.1", port: 0 },
    maxPreviewBytes: 1_048_576,
  });
});

test("explicit bridge addresses retain port zero and valid fixed ports", () => {
  for (const port of [0, 65_535]) {
    const app = defineApp({
      env: defineEnv({}),
      inspector: { enabled: true, connection: { host: "0.0.0.0", port } },
    });
    expect(app.inspector?.connection).toEqual({ host: "0.0.0.0", port });
    expect(Object.isFrozen(app.inspector?.connection)).toBe(true);
  }
});

test("obsolete UI port is rejected with bridge and standalone-tool guidance", () => {
  const input = { enabled: true, port: 3210 };
  expect(() => defineApp({ env: defineEnv({}), inspector: input })).toThrow(
    /inspector\.connection.*relkit-inspector/,
  );
});

test.each([
  { enabled: "yes" },
  { enabledInProduction: true },
  { connection: { host: "" } },
  { connection: { host: "http://localhost" } },
  { connection: { host: "localhost/path" } },
  { connection: { host: "localhost\n" } },
  { connection: { port: -1 } },
  { connection: { port: 65_536 } },
  { connection: { port: 1.5 } },
  { maxPreviewBytes: 0 },
])("invalid inspector selection fails during application definition: %j", (inspector) => {
  expect(() => Reflect.apply(defineApp, undefined, [{ env: defineEnv({}), inspector }])).toThrow();
});
