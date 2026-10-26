/** Replaceable application operations and owned harness authorities. */
import { Context, Layer } from "effect";
import { activateGenericTestServices } from "./application-generic-services.js";
import { loadTestApplicationArtifacts } from "./application-registry.js";
import { loadTestRoutes } from "./application-routes.js";
import { activateTestProviders } from "./provider-replacements.js";
import type { ApplicationPlatform, ApplicationHarness } from "./application.types.js";

/** Native application dependencies substituted before acquisition. */
export class TestApplicationPlatform extends Context.Service<
  TestApplicationPlatform,
  ApplicationPlatform
>()("relkit/testing/ApplicationPlatform") {}

/** Resources and release failures owned by one application Layer scope. */
export class TestApplicationHarness extends Context.Service<
  TestApplicationHarness,
  ApplicationHarness
>()("relkit/testing/ApplicationHarness") {}

/** General live platform; selected native helpers enter through explicit options. */
export const TestApplicationPlatformLive = Layer.succeed(
  TestApplicationPlatform,
  TestApplicationPlatform.of({
    artifacts: loadTestApplicationArtifacts,
    routes: loadTestRoutes,
    providers: activateTestProviders,
    services: activateGenericTestServices,
  }),
);
