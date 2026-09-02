import { expect, test } from "bun:test";
import { defineEnv } from "@relkit/config";
import {
  createBindingValueRef,
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
} from "@relkit/provider";
import { defineApp } from "./src/define-app.ts";

const cache = (url: string | ReturnType<typeof createBindingValueRef>) =>
  defineProviderAdapter({
    integration: defineIntegrationReference("redis"),
    capability: defineProviderCapability("cache"),
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: { sensitive: true } }),
    connection: { url },
    behavior: defineProviderBehavior({}),
  });

test("defines one immutable application topology with singular provider inputs", () => {
  const telemetry = {
    redaction: { mode: "off" as "off" | "development-redacted" },
    localRetention: { maxRecords: 128 },
  };
  const app = defineApp({
    id: "commerce-api",
    env: defineEnv({}),
    cache: cache(createBindingValueRef("CACHE_URL", "secret-string")),
    defaults: { cache: "default" },
    telemetry,
    server: { port: 4000 },
    inspector: { port: 4001 },
    deployment: { engine: "pulumi", host: "aws" },
  });

  telemetry.redaction.mode = "development-redacted";
  expect(app).toMatchObject({
    kind: "app",
    id: "commerce-api",
    cache: {
      capability: "cache",
      profiles: { default: { source: { kind: "connected" } } },
    },
    defaults: { cache: "default" },
    telemetry: { redaction: { mode: "off" }, localRetention: { maxRecords: 128 } },
    server: { port: 4000 },
    inspector: { port: 4001 },
    deployment: { engine: "pulumi", host: "aws" },
  });
  expect(Object.isFrozen(app)).toBe(true);
  expect(Object.isFrozen(app.cache.profiles.default)).toBe(true);
  expect(Object.isFrozen(app.telemetry)).toBe(true);
});

test("normalizes named profiles and validates explicit defaults", () => {
  const env = defineEnv({});
  const app = defineApp({
    env,
    cache: {
      requests: cache("redis://requests"),
      timeline: cache("redis://timeline"),
    },
    defaults: { cache: "requests" },
  });
  expect(Object.keys(app.cache.profiles)).toEqual(["requests", "timeline"]);
  expect(() =>
    defineApp({
      env,
      cache: { requests: cache("redis://requests") },
      defaults: { cache: "missing" as "requests" },
    }),
  ).toThrow("defaults.cache must reference a configured profile");
});

test("rejects plural and unknown application options", () => {
  const unsafeDefineApp = defineApp as (options: Record<string, unknown>) => unknown;
  expect(() => unsafeDefineApp({ env: defineEnv({}), caches: {} })).toThrow(
    'Unknown defineApp option "caches"',
  );
  expect(() => unsafeDefineApp({ env: defineEnv({}), observability: {} })).toThrow(
    'Unknown defineApp option "observability"',
  );
  expect(() =>
    unsafeDefineApp({ env: defineEnv({}), telemetry: { bodyCapture: { mode: "off" } } }),
  ).toThrow('Unknown telemetry option "bodyCapture"');
});
