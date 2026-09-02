import { expect, test } from "bun:test";
import { DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION } from "@relkit/deploy";
import { pulumiEngine } from "./src/engine/index.ts";

test("exports a protocol-only deployment engine identity", () => {
  expect(pulumiEngine).toEqual({
    kind: "deployment-integration",
    protocolVersion: DEPLOYMENT_INTEGRATION_PROTOCOL_VERSION,
    integrationId: "pulumi",
    role: "engine",
  });
  expect(Object.isFrozen(pulumiEngine)).toBe(true);
});
