/**
 * Checks tooling's disabled defaults and strict bridge input validation without
 * importing application authoring or acquiring optional inspection resources.
 */
import { expect, test } from "vitest";
import { loadConfig } from "../src/config-loader.js";

test("tooling defaults disable inspection and reserve an ephemeral loopback bridge", () => {
  for (const input of [{}, { inspector: { enabled: false } }]) {
    expect(loadConfig(input).inspector).toEqual({
      enabled: false,
      connection: { host: "127.0.0.1", port: 0 },
      maxPreviewBytes: 1_048_576,
    });
  }
  expect(loadConfig({ inspector: { enabled: true } }).inspector.enabled).toBe(true);
});

test("tooling rejects obsolete UI port configuration with correction guidance", () => {
  expect(() => loadConfig({ inspector: { port: 3210 } })).toThrow(
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
])("tooling rejects malformed bridge metadata: %j", (inspector) => {
  expect(() => loadConfig({ inspector })).toThrow();
});
