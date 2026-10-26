/**
 * Emits the imports portion of an accepted server cohort.
 * This pure fragment acquires no resources; generated code delegates ownership
 * and expected runtime failures to the existing typed server host.
 */
import { RUNTIME_INTEGRATION_PLAN_FILE } from "@relkit/contracts";
import { SERVER_BOOTSTRAP_SOURCE } from "./build-server-bootstrap.js";
import { serverEngineImports } from "./build-server-engine-imports.js";
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
  const httpImport = `import { createPreparedApp, createHttpAuthRuntime, createHttpSpanRuntime, instrumentHttpRequest } from "@relkit/runtime-hono/internal/prepared";`;
  let planImport = `import { createRegistrationPlan } from "@relkit/graph";`;
  if (input.configuration.httpApplication === "prepared") {
    planImport = `import { deepFreeze } from "@relkit/contracts";`;
  }
  const engine = serverEngineImports(input.graph);
  return `import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import { createServerRuntimeHost } from "@relkit/engine/internal/server-runtime";
${providerOverridesImport}
${agentSource.imports}
import { createApplicationContextResolver } from "@relkit/app/internal/runtime";
import { resolveEnv } from "@relkit/config";
${specializedImports}
import { ${engine.imports} } from "@relkit/engine";
${planImport}
let InspectorQueryError;
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
${engine.stubs}

`;
}
