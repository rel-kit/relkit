/** Resolves the real native owner's package metadata for compiler unit inputs without evaluating an execution module. */
import { resolve } from "node:path";
import { resolveRuntimeIntegrationPackages } from "../../packages/compiler/src/index.ts";

export const nativeAgentRuntimePackages = resolveRuntimeIntegrationPackages({
  projectRoot: resolve(import.meta.dir, "../../integrations/packages/langchain"),
  imports: ["@relkit/langchain"],
});
