/** Exercises published setup descriptors, local profile selection, and required secret validation. */
import { expect, test } from "bun:test";
import { resolveEnv } from "@relkit/app/config";
import storage from "../examples/setup/storage.js";
import caching from "../examples/setup/caching.js";
import realtime from "../examples/setup/realtime.js";
import agents from "../examples/setup/agents.js";
import events from "../examples/setup/events.js";
import postgres from "../examples/setup/postgresql.js";
import auth from "../examples/setup/auth.js";
import http from "../examples/setup/http.js";
import telemetry from "../examples/setup/telemetry.js";
import connected from "../examples/setup/connected.js";
import cloudflare from "../examples/setup/cloudflare.js";
import deployment from "../examples/setup/deployment.js";

test("local setup descriptors select the profiles used by their module examples", () => {
  for (const [app, capability, profile, adapter] of [
    [storage, "bucket", "assets", "s3"],
    [caching, "cache", "requests", "redis"],
    [realtime, "realtime", "default", "redis-realtime"],
    [agents, "agent-state", "default", "redis-agent-state"],
  ] as const) {
    expect(app).toMatchObject({
      [capability]: {
        profiles: {
          [profile]: { source: { kind: "local-only" }, adapter: { adapterId: adapter } },
        },
      },
      defaults: { [capability]: profile },
    });
    expect(resolveEnv(app.env, { environment: "development", source: {} })).toEqual({});
    expect(Object.isFrozen(app)).toBe(true);
  }
  for (const app of [events, http, telemetry, connected, cloudflare, deployment]) {
    expect(app.kind).toBe("app");
    expect(Object.isFrozen(app)).toBe(true);
  }
});

test("database and auth setup fail without required values and never default credentials", () => {
  for (const app of [postgres, auth]) {
    expect(() => resolveEnv(app.env, { environment: "development", source: {} })).toThrow();
    expect(app.env.metadata.DATABASE_URL).toMatchObject({ sensitive: true, hasDefault: false });
  }
  const source = {
    DATABASE_URL: "postgres://test:test@127.0.0.1:5433/test",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    BETTER_AUTH_SECRET: "synthetic-docs-test-secret-1234567890",
  };
  expect(resolveEnv(auth.env, { environment: "development", source })).toEqual({
    ...source,
    BETTER_AUTH_URL: new URL(source.BETTER_AUTH_URL),
  });
  expect(auth.env.metadata.BETTER_AUTH_SECRET).toMatchObject({
    sensitive: true,
    hasDefault: false,
  });
  expect(() =>
    resolveEnv(auth.env, {
      environment: "development",
      source: { ...source, BETTER_AUTH_URL: "invalid" },
    }),
  ).toThrow();
});
