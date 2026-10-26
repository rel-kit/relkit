/** Verifies pure server emission retains explicit optional selections and async startup for both generation forms. */
import { expect, test } from "vitest";
import { serverHttpSource } from "../src/commands/build-server-http.js";
import { serverHttpOptionsSource } from "../src/commands/build-server-http-options.js";
import type { ServerSourceConfiguration } from "../src/commands/build-server.types.js";

const selected: ServerSourceConfiguration = {
  maxBodyBytes: 1024,
  apiDocs: { enabledInProduction: false, ui: "scalar" },
  mcp: true,
  agUi: true,
  clientContract: true,
  maxPreviewBytes: 1024,
};

test("generated options retain independently selected transports", () => {
  const source = serverHttpOptionsSource(selected);
  expect(source).toContain('ui: "scalar"');
  expect(source).toContain("mcp: { enabled: true }");
  expect(source).toContain("agUi: true");
});

test("full and prepared generations await startup before listener publication", () => {
  for (const configuration of [selected, { ...selected, httpApplication: "prepared" as const }]) {
    const source = serverHttpSource(configuration);
    expect(source.indexOf("await runtimeOwner.resource")).toBeLessThan(source.indexOf("Bun.serve"));
    expect(source).toContain("createPreparedApp(httpApplicationOptions");
    expect(source).toContain('internalEndpointsEnabled = environment !== "production"');
    expect(source).not.toContain('RELKIT_INTERNAL_ENDPOINTS === "1"');
  }
});
