/**
 * Emits the imports portion of an accepted server cohort.
 * This pure fragment acquires no resources; generated code delegates ownership
 * and expected runtime failures to the existing typed server host.
 */
import { RUNTIME_INTEGRATION_PLAN_FILE } from "@relkit/contracts";
import { SERVER_BOOTSTRAP_SOURCE } from "./build-server-bootstrap.js";
import type { ServerSourceEmission } from "./build-server.types.js";

/**
 * Emits this stage from the same complete compilation result as every neighbor.
 * @param input - Accepted graph/cohort and feature-selected emission fragments.
 * @returns Pure source text; no descriptors are reevaluated.
 */
export function serverImportsSource(input: ServerSourceEmission): string {
  const { agentSource, options } = input;
  const { providerOverridesImport, specializedImports, localServicesImport, jobsManifestImport } =
    options;
  let httpImport = `import { createApp, createHttpAuthRuntime, createHttpSpanRuntime, instrumentHttpRequest } from "@relkit/runtime-hono";`;
  let planImport = `import { createRegistrationPlan } from "@relkit/graph";`;
  let inspectorImport = `import { installInspectorEndpoints, InspectorQueryError } from "@relkit/inspector-api";`;
  if (input.configuration.httpApplication === "prepared") {
    httpImport = `import { createPreparedApp, createHttpAuthRuntime, createHttpSpanRuntime, instrumentHttpRequest } from "@relkit/runtime-hono/internal/prepared";`;
    planImport = `import { deepFreeze } from "@relkit/contracts";`;
    inspectorImport = "let InspectorQueryError;";
  }
  const hasJobs = input.graph.nodes.some(
    (node) =>
      node.kind === "job" ||
      node.kind === "task" ||
      (node.kind === "trigger" &&
        node.config !== null &&
        typeof node.config === "object" &&
        "kind" in node.config &&
        node.config.kind === "queue"),
  );
  const hasEvents = input.graph.nodes.some((node) => node.kind === "event");
  const engineImports = [
    "assertRuntimeIntegrationModules",
    "createFunctionRegistry",
    "createProviderRegistry",
    ...(hasJobs ? ["createTaskExecutor"] : []),
    "invoke",
    ...(hasEvents ? ["materializeEvents"] : []),
    ...(hasJobs ? ["materializeJobs"] : []),
    "parseInfrastructureBindingValues",
  ].join(", ");
  const optionalEngineStubs = `${hasJobs ? "" : "const createTaskExecutor = () => undefined;\nconst materializeJobs = async () => undefined;"}
${hasEvents ? "" : "const materializeEvents = async () => undefined;"}`;
  return `import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import { createServerRuntimeHost } from "@relkit/cli/internal/server-runtime";
${providerOverridesImport}
${agentSource.imports}
import { createApplicationContextResolver } from "@relkit/app/internal/runtime";
import { resolveEnv } from "@relkit/config";
${specializedImports}
import { ${engineImports} } from "@relkit/engine";
${planImport}
${inspectorImport}
import { currentExecutionContext, publicTrace } from "@relkit/invocation";
import { createObservabilityRuntime, createTelemetryExporterFanout } from "@relkit/observability";
import { consoleHumanSink, createLoggerLayer, formatHumanLog, stdoutJsonSink, redactFailureDetail } from "@relkit/runtime-effect";
${httpImport}
import { honoWebSocket, upgradeWebSocket } from "@relkit/runtime-hono/bun";
import runtimeIntegrationsPlan from "./${RUNTIME_INTEGRATION_PLAN_FILE}" with { type: "json" };
import { runtimeIntegrationModules } from "./runtime-integrations.ts";
${localServicesImport}
${jobsManifestImport}
import { runtimeManifest } from "./runtime.manifest.ts";
${SERVER_BOOTSTRAP_SOURCE}
${optionalEngineStubs}

`;
}
