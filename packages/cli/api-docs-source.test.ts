import { expect, test } from "bun:test";
import { serverHttpSource } from "./src/commands/build-server-http.ts";

test("passes configured domain exclusions to the runtime API reference", () => {
  const source = serverHttpSource({
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false, excludeDomains: ["navigation", "auth"] },
    clientContract: true,
    mcp: true,
    maxPreviewBytes: 1_048_576,
  });

  expect(source).toContain('excludeDomains: ["navigation","auth"]');
});
