/** Validates public backend, packaged Inspector and documentation responses from the owned dev child. */
import { strict as assert } from "node:assert";
import { Effect, Schema } from "effect";
import { scaffoldRequest } from "./scaffold-http.js";

const greeting = Schema.Struct({ message: Schema.String });
const health = Schema.Struct({ ok: Schema.Boolean });

/**
 * Exercises the original public contracts through native HTTP.
 * @param port - Backend listener.
 * @param inspector - Packaged Inspector listener.
 * @param taskProject - Whether the maintained internal task fixture exposes health.
 * @returns Completion after all response assertions.
 */
export const verifyScaffoldDevContracts = Effect.fn("ScaffoldDev.contracts")(function* (
  port: number,
  inspector: number,
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
    [`http://127.0.0.1:${inspector}/_relkit/backend/_relkit/v1/graph`, '"graphHash"'],
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
  assert.equal(reference.status, 404, "Default scaffolds do not select the Scalar UI");
  assert.doesNotMatch(yield* Effect.promise(() => reference.text()), /scalar/i);
});
