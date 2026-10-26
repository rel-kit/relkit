/**
 * Validates selected HTTP peers through the shared dependency checker, then loads
 * only their narrow entrypoints. Preparation happens inside the generation owner
 * before readiness; no request context or cancellation authority is captured.
 */
import { Context, Effect, Layer } from "effect";
import { fileURLToPath } from "node:url";
import {
  SelectedDependencies,
  SelectedDependenciesLive,
} from "@relkit/provider/internal/dependencies";
import type { CreateAppOptions } from "./create-app.types.js";
import { httpBoundary, observeHttp } from "./http-effect.js";
import type { OptionalHttpCapability } from "./optional-transports.types.js";
import { HTTP_TRANSPORT_REQUIREMENTS, selectedHttpCapabilities } from "./selected-transports.js";

/** Loads exactly one native installer after its requirement has been validated.
 * @param capability - Explicit selected HTTP capability.
 * @param options - Generation options accumulated from prior independent selections.
 * @returns Options enriched only with the selected capability's native installer.
 */
function loadSelected(capability: OptionalHttpCapability, options: CreateAppOptions) {
  return httpBoundary(`http.${capability}.initialize`, async (): Promise<CreateAppOptions> => {
    switch (capability) {
      case "mcp": {
        const { installMcp } = await import("@relkit/runtime-hono/mcp");
        return {
          ...options,
          optionalTransports: { ...options.optionalTransports, mcp: installMcp },
        };
      }
      case "ag-ui": {
        const { installAgentProtocolEndpoints } = await import("@relkit/runtime-hono/ag-ui");
        return {
          ...options,
          optionalTransports: {
            ...options.optionalTransports,
            agUi: installAgentProtocolEndpoints,
          },
        };
      }
      case "scalar": {
        const { scalarReference } = await import("@relkit/runtime-hono/scalar");
        return { ...options, apiDocs: { ...options.apiDocs, reference: scalarReference } };
      }
    }
  });
}

/** Shared SDK selection is replaceable through the provider checker Layer in tests. */
export class SelectedHttpTransports extends Context.Service<SelectedHttpTransports>()(
  "relkit/http/SelectedHttpTransports",
  {
    make: Effect.gen(function* () {
      const checker = yield* SelectedDependencies;
      /** Validates and initializes selected SDKs once during generation acquisition.
       * @param options - Accepted generation options and actual consumer root.
       * @returns Enriched options or actionable dependency/native initialization failure.
       */
      const prepare = Effect.fn("SelectedHttpTransports.prepare")(
        function* (options: CreateAppOptions) {
          const capabilities = selectedHttpCapabilities(options);
          yield* checker.check({
            projectRoot: options.dependencyProjectRoot ?? process.cwd(),
            adapter: "@relkit/runtime-hono",
            adapterRoot: fileURLToPath(new URL("../", import.meta.url)),
            capabilities,
            requirements: HTTP_TRANSPORT_REQUIREMENTS,
            phase: "runtime",
            ...(options.packageManager === undefined ? {} : { manager: options.packageManager }),
          });
          let configured = options;
          for (const capability of capabilities)
            configured = yield* loadSelected(capability, configured);
          return configured;
        },
        (effect) => observeHttp("transports.prepare", effect),
      );
      return { prepare };
    }),
  },
) {}

/** Live composition resolves peer metadata without loading unrelated integrations. */
export const SelectedHttpTransportsLive = Layer.effect(
  SelectedHttpTransports,
  SelectedHttpTransports.make,
).pipe(Layer.provide(SelectedDependenciesLive));
