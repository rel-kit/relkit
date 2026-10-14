/** Verifies grouped commerce routes through the native compiler and one owned HTTP engine path. */
import { test } from "bun:test";
import { Effect } from "effect";
import { commerceHttpFixture } from "./commerce-http-fixture.ts";
import { verifyOrderReads, verifyOrderMethods } from "./commerce-http-orders.ts";
import { verifyNavigation, verifyUpload, verifyInvalidUploads } from "./commerce-http-uploads.ts";
import { verifyCommerceContracts } from "./commerce-http-contracts.ts";
test(
  "serves the compiled commerce routes through one HTTP engine path",
  () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* commerceHttpFixture;
          yield* verifyOrderReads(fixture);
          yield* verifyOrderMethods(fixture);
          yield* verifyNavigation(fixture);
          yield* verifyUpload(fixture);
          yield* verifyInvalidUploads(fixture);
          yield* verifyCommerceContracts(fixture);
        }),
      ),
    ),
  15000,
);
