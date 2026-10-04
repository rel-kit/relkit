import type {
  FunctionRegistry,
  FunctionRegistryOptions,
  LoadedRuntimeIntegrationModule,
} from "@relkit/engine";

/** Compiled graph, registry and native integration evidence acquired by an application. */
export interface TestApplicationArtifacts {
  readonly graph: FunctionRegistryOptions["graph"];
  readonly publicFingerprint: string;
  readonly registry: FunctionRegistry;
  readonly runtimeIntegrationModules: readonly LoadedRuntimeIntegrationModule[];
}
