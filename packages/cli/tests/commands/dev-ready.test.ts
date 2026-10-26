/** Verifies ready links follow explicit native documentation selection without changing other endpoints. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { logDevReady, logDevReadyEffect } from "../../src/commands/dev-ready.js";
import type { DevLogEvent } from "../../src/commands/dev.types.js";
import { filesystemTestLayer } from "../services/test-layers.js";

test("unselected optional UI has no advertised Reference URL", () => {
  const events: DevLogEvent[] = [];
  logDevReady((event) => events.push(event), "127.0.0.1", 3000, 3210);
  expect(events[0]?.fields).toEqual({
    backend: "http://127.0.0.1:3000",
    openapi: "http://127.0.0.1:3000/_relkit/v1/openapi.json",
    inspector: "http://127.0.0.1:3210",
  });
});

test("activated explicit Scalar metadata advertises its Reference URL", async () => {
  const events: DevLogEvent[] = [];
  const paths: string[] = [];
  await Effect.runPromise(
    logDevReadyEffect((event) => events.push(event), "localhost", 3000, "/accepted").pipe(
      Effect.provide(
        filesystemTestLayer({
          readText: (path) => {
            paths.push(path);
            return Effect.succeed(
              JSON.stringify({ server: { apiDocs: { ui: "scalar", enabledInProduction: false } } }),
            );
          },
        }),
      ),
    ),
  );
  expect(paths).toEqual(["/accepted/manifest.json"]);
  expect(events[0]?.fields).toEqual({
    backend: "http://localhost:3000",
    openapi: "http://localhost:3000/_relkit/v1/openapi.json",
    apiReference: "http://localhost:3000/_relkit/v1/api-reference",
  });
});

test("invalid metadata reports unavailable presentation without granting a UI link", async () => {
  const events: DevLogEvent[] = [];
  await Effect.runPromise(
    logDevReadyEffect((event) => events.push(event), "localhost", 3000, "/accepted").pipe(
      Effect.provide(filesystemTestLayer({ readText: () => Effect.succeed("{") })),
    ),
  );
  expect(events.map((event) => event.event)).toEqual([
    "dev.ready.metadata-unavailable",
    "dev.ready",
  ]);
  expect(events[1]?.fields).not.toHaveProperty("apiReference");
  expect(events[1]?.fields?.openapi).toBe("http://localhost:3000/_relkit/v1/openapi.json");
});
