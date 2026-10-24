/** Checks selected deployment metadata before its SDK namespace is evaluated. */
import { Effect } from "effect";
import type { ResolvedIntegrationPackageRole } from "@relkit/compiler";
import {
  SelectedDependencies,
  SelectedDependenciesLive,
} from "@relkit/provider/internal/dependencies";
import { cliAdapterError } from "../cli-errors.js";

/** Retains the original resolution failure while presenting deployment diagnostics. */
export const validateDeploymentRequirements = Effect.fn("Deployment.dependencies")(
  (projectRoot: string, role: string, selected: ResolvedIntegrationPackageRole) =>
    Effect.gen(function* () {
      const checker = yield* SelectedDependencies;
      yield* checker.check({
        projectRoot,
        adapter: selected.packageName,
        ...(selected.packageRoot === undefined ? {} : { adapterRoot: selected.packageRoot }),
        capabilities: [role],
        phase: "deploy",
        requirements: selected.requirements ?? [],
      });
    }).pipe(
      Effect.provide(SelectedDependenciesLive),
      Effect.mapError((cause) => cliAdapterError("deployment.dependencies", cause)),
    ),
);
