/** Describes the owned test application and replaceable acquisition platform.
 * Generic contracts retain existing runtime environment/context semantics without a native auth or database SDK edge.
 */
import type { JsonValue } from "@relkit/contracts";
import type { TestRuntimeOptions, TestRuntime, TestClock } from "./runtime.js";
import type { TestFakes } from "./fakes.js";
import type { TestHttpClient, TestObservability } from "./http.js";
import type { loadTestApplicationArtifacts } from "./application-registry.js";
import type { loadTestRoutes } from "./application-routes.js";
import type { activateTestProviders } from "./provider-replacements.js";
import type { TestServiceActivator } from "./application-services.types.js";

/** Explicit test application project, environment and native platform inputs. */
export type TestApplicationOptions = Omit<TestRuntimeOptions, "app"> & {
  readonly projectRoot?: string;
  readonly bindingValues?: Readonly<Record<string, JsonValue>>;
  readonly resourceProviders?: "configured" | "fake";
  readonly services?: TestServiceActivator;
};

/** Owned compiled test application, direct HTTP facade and complete release boundary. */
export interface TestApplication {
  readonly runtime: TestRuntime;
  readonly http: TestHttpClient;
  readonly clock: TestClock;
  readonly fakes: TestFakes;
  readonly observability: TestObservability;
  readonly close: () => Promise<void>;
}

/** Replaceable application acquisition operations used by the owning service Layer. */
export interface ApplicationPlatform {
  readonly artifacts: typeof loadTestApplicationArtifacts;
  readonly routes: typeof loadTestRoutes;
  readonly providers: typeof activateTestProviders;
  readonly services: TestServiceActivator;
}

/** Effect-owned application request workflow and native application state. */
export interface ApplicationHarness {
  readonly value: Omit<TestApplication, "close">;
  readonly cleanupFailures: unknown[];
}
