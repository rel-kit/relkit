/** Verifies docs endpoints, generated contracts and invocation attribution after grouped moves. */
import { expect } from "bun:test";
import { Effect } from "effect";
import { API_REFERENCE_PATH, OPENAPI_PATH } from "../../../packages/runtime-hono/src/index.ts";
import { generateClient } from "../../../packages/client-generator/src/index.ts";
import { generateOpenApiJson } from "../../../packages/openapi/src/index.ts";
import type { CommerceHttpFixture } from "./commerce-http.types.ts";
/**
 * Checks native OpenAPI/Scalar responses and exact generated public contracts.
 * @param fixture - Compiler, route client and invocation observations.
 * @returns Completion with unchanged public contracts.
 */
export const verifyCommerceContracts = Effect.fn("test.commerce.http.contracts")(function* ({
  client,
  compiled,
  graph,
  invocations,
}: CommerceHttpFixture) {
  const openapi = yield* Effect.tryPromise(() => client.get(OPENAPI_PATH));
  expect(openapi.status).toBe(200);
  expect(yield* Effect.tryPromise(() => openapi.json())).toMatchObject({
    openapi: "3.1.0",
    paths: { "/uploads": {}, "/docs": {}, "/docs/{parts}": {} },
  });
  const scalar = yield* Effect.tryPromise(() => client.get(API_REFERENCE_PATH));
  expect(scalar.status).toBe(200);
  expect((yield* Effect.tryPromise(() => scalar.text())).toLowerCase()).toContain("scalar");
  expect(compiled.diagnostics).toEqual([]);
  expect(generateOpenApiJson(graph)).toBe(compiled.normalization.outputs.openapi);
  expect(generateClient(graph)).toBe(compiled.normalization.outputs.client);
  expect(invocations.every(({ source }) => source === "http")).toBe(true);
  expect(invocations.map(({ functionId }) => functionId)).toEqual(
    expect.arrayContaining([
      "orders.create-order",
      "orders.get-order",
      "orders.search-orders",
      "orders.update-order",
      "orders.delete-order",
      "navigation.browse-path",
      "assets.upload-assets",
    ]),
  );
});
