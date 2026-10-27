/** Validates core transports, the default Scalar reference and omitted-disabled inspection in installed development. */
import { strict as assert } from "node:assert";
import { Effect, Schema } from "effect";
import { scaffoldRequest } from "./scaffold-http.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const greeting = Schema.Struct({ message: Schema.String });
const health = Schema.Struct({ ok: Schema.Boolean });

/**
 * Exercises the original public contracts through native HTTP.
 * @param port - Backend listener.
 * @param root - Installed project with default inspection omitted.
 * @param taskProject - Whether the maintained internal task fixture exposes health.
 * @returns Completion after all response assertions.
 */
export const verifyScaffoldDevContracts = Effect.fn("ScaffoldDev.contracts")(function* (
  port: number,
  root: string,
  taskProject: boolean,
) {
  const base = `http://127.0.0.1:${port}`;
  const response = yield* scaffoldRequest(base + (taskProject ? "/health" : "/hello?name=RelKit"));
  const body = yield* Effect.promise(() => response.text());
  if (taskProject)
    assert.equal(Schema.decodeUnknownSync(Schema.fromJsonString(health))(body).ok, true);
  else
    assert.equal(
      Schema.decodeUnknownSync(Schema.fromJsonString(greeting))(body).message,
      "Hello, RelKit!",
    );
  const endpoints = [
    [`${base}/_relkit/v1/graph`, '"graphHash"'],
    [`${base}/_relkit/v1/openapi.json`, '"openapi":"3.1.0"'],
  ] as const;
  for (const [url, expected] of endpoints) {
    const result = yield* scaffoldRequest(url);
    assert.equal(result.ok, true, url);
    assert.ok(
      (yield* Effect.promise(() => result.text())).toLowerCase().includes(expected.toLowerCase()),
      url,
    );
  }
  const reference = yield* scaffoldRequest(`${base}/_relkit/v1/api-reference`);
  assert.equal(reference.status, 200, "Default scaffolds select the Scalar UI");
  assert.match(yield* Effect.promise(() => reference.text()), /scalar/i);
  const rich = yield* scaffoldRequest(`${base}/_relkit/v1/runtime`);
  assert.equal(rich.status, 404);
  yield* Effect.promise(() => rich.arrayBuffer());
  assert.equal(existsSync(join(root, ".relkit/connections")), false);
  assert.equal(existsSync(join(root, ".relkit/observability/observability.duckdb")), false);
});
