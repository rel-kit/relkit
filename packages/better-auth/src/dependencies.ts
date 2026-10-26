/** Checks selected native authentication requirements without evaluating the SDK. */
import { fileURLToPath } from "node:url";
import {
  SelectedDependencies,
  SelectedDependenciesLive,
} from "@relkit/provider/internal/dependencies";
import { Effect } from "effect";
import { AuthFailure } from "./auth.errors.js";

/** Resolves peers from this installed adapter, independently of the invoking CLI cache. */
export function checkNativeAuthDependencies() {
  return Effect.flatMap(SelectedDependencies, (checker) =>
    checker.check({
      adapter: "@relkit/better-auth",
      adapterRoot: fileURLToPath(new URL("../", import.meta.url)),
      projectRoot: process.cwd(),
      capabilities: ["better-auth"],
      phase: "runtime",
    }),
  ).pipe(
    Effect.provide(SelectedDependenciesLive),
    Effect.mapError((cause) => new AuthFailure({ operation: "auth.acquire", cause })),
    Effect.asVoid,
  );
}
