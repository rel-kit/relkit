/**
 * Checks immutable application normalization and authoring validation against
 * real provider descriptors. These constructors do not acquire runtime resources.
 */
import { expect, test } from "vitest";
import { defineEnv } from "@relkit/config";
import {
  createBindingValueRef,
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
} from "@relkit/provider";
import { defineApp } from "../src/define-app.js";

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
    inspector: { enabled: true, connection: { port: 4001 } },
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
    inspector: { enabled: true, connection: { host: "127.0.0.1", port: 4001 } },
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
  expect(() => Reflect.apply(defineApp, undefined, [{ env: defineEnv({}), caches: {} }])).toThrow(
    'Unknown defineApp option "caches"',
  );
  expect(() =>
    Reflect.apply(defineApp, undefined, [{ env: defineEnv({}), observability: {} }]),
  ).toThrow('Unknown defineApp option "observability"');
  expect(() =>
    Reflect.apply(defineApp, undefined, [
      { env: defineEnv({}), telemetry: { bodyCapture: { mode: "off" } } },
    ]),
  ).toThrow('Unknown telemetry option "bodyCapture"');
});
