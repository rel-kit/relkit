/** Validates the selected ORM before loading runtime activation or calling the native factory. */
import { fileURLToPath } from "node:url";
import {
  SelectedDependencies,
  SelectedDependenciesLive,
} from "@relkit/provider/internal/dependencies";
import { Effect } from "effect";
import type { DrizzleServiceDescriptor } from "./types.js";
import type { DrizzleActivation, DrizzleActivationOptions } from "./activation.types.js";

/** Acquires a database using the existing owner after selected dependency validation. */
export async function activateDrizzleService<
  Service extends DrizzleServiceDescriptor<any, any, any, any>,
>(
  service: Service,
  env: Readonly<Record<string, unknown>>,
  options: DrizzleActivationOptions = {},
): Promise<DrizzleActivation<Service>> {
  await Effect.runPromise(
    Effect.flatMap(SelectedDependencies, (checker) =>
      checker.check({
        adapter: "@relkit/drizzle",
        adapterRoot: fileURLToPath(new URL("../", import.meta.url)),
        projectRoot: process.cwd(),
        capabilities: ["drizzle"],
        phase: "runtime",
      }),
    ).pipe(Effect.provide(SelectedDependenciesLive)),
  );
  const { activateDrizzleService: activate } = await import("./activation.js");
  return activate(service, env, options);
}
