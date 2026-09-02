import { expect, test } from "bun:test";
import * as app from "./src/index.ts";
import * as config from "./src/config.ts";

const removed = [
  "defineConfig",
  "external",
  "managed",
  "connect",
  "connection",
  "provision",
  "s3",
  "redis",
  "sqs",
  "eventBridge",
  "aiSdk",
  "otlp",
  "cloudWatch",
  "PROVIDER_CAPABILITIES",
  "copyProviderTopology",
  "isProviderBinding",
  "providerEnvironment",
  "isProviderTopology",
] as const;

test("does not expose legacy provider authoring or compatibility exports", () => {
  for (const name of removed) {
    expect(Object.prototype.hasOwnProperty.call(app, name)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(config, name)).toBe(false);
  }
  expect(typeof app.defineApp).toBe("function");
  expect(typeof config.defineApp).toBe("function");
});
