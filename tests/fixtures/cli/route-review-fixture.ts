/** Borrows an Effect-owned grouped template fixture and joins the real CLI child/output before decoding its public check contract. */
import { resolve, join } from "node:path";
import { realpath } from "node:fs/promises";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { Effect, Schema } from "effect";
import { project, linkDependencies } from "../../generator/add-acceptance-fixture.js";
import { scaffoldChild } from "../../../scripts/scaffold-process.js";
import { ScaffoldProcessFailure } from "../../../scripts/scaffold-process.errors.js";
import { RouteReviewResult } from "./route-review.schemas.js";

/**
 * Acquires the maintained minimal template and all its exact native module/type dependencies.
 * @returns The test-runner-owned grouped root; afterEach joins its managed fixture cleanup.
 */
export async function routeReviewFixture(): Promise<string> {
  const root = await Effect.runPromise(
    scaffoldNative("route.fixture.canonical", async () => realpath(await project("minimal"))),
  );
  await linkDependencies(root);
  return root;
}

/**
 * Executes the real packed CLI check command with bounded owned process cleanup.
 * @param root - Borrowed test-owned grouped application.
 * @returns The actual exit and decoded public result after both output drains settle.
 */
export function checkRouteReview(root: string) {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const repository = resolve(import.meta.dir, "../../..");
        const owner = yield* scaffoldChild({
          args: [
            join(repository, "packages/cli/dist/bin.js"),
            "check",
            "--project-root",
            root,
            "--json",
          ],
          cwd: root,
        });
        const [exit, output, errors] = yield* Effect.promise(() => owner.settled);
        if (
          exit.status !== "fulfilled" ||
          output.status !== "fulfilled" ||
          errors.status !== "fulfilled"
        )
          return yield* new ScaffoldProcessFailure({
            operation: "route.check.output",
            message: "Native route check did not settle",
          });
        const result = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RouteReviewResult))(
          output.value,
        ).pipe(
          Effect.mapError(
            (cause) =>
              new ScaffoldProcessFailure({
                operation: "route.check.decode",
                message: cause.message,
              }),
          ),
        );
        return { exitCode: exit.value, result, errors: errors.value };
      }),
    ).pipe(Effect.timeout("30 seconds")),
  );
}
