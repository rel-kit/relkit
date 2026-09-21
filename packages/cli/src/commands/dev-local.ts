import { formatDiagnostics, type Diagnostic } from "@relkit/diagnostics";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LocalServiceRecipeInput } from "@relkit/local-service";
import type { CandidateCompile, CandidateCompileRequest } from "@relkit/supervisor";
import { buildProject } from "./build.js";
import { checkProject } from "./check.js";
import { localPlanFrom, reconcileLocalServices } from "./dev-local-services.js";
export { checkedLocalArtifacts } from "./dev-local-services.js";
import type { DevLocalServiceOwner } from "./dev-local-runtime.js";
import type { TelemetryConfiguration } from "@relkit/observability";
import { localWorkerArtifacts, prepareLocalWorkerOverrides } from "./local-service-options.js";

export interface DevLocalCompiler {
  readonly compile: CandidateCompile;
  readonly close: () => Promise<void>;
}

export function createDevLocalCompiler(
  projectRoot: string,
  localEnabled = true,
  configureTelemetry?: (configuration: TelemetryConfiguration) => Promise<void> | undefined,
  color = false,
  backendPort = 3000,
): DevLocalCompiler {
  let owner: DevLocalServiceOwner | undefined;
  const recipes = new Map<string, LocalServiceRecipeInput>();
  return Object.freeze({
    compile: async (request: CandidateCompileRequest) => {
      const checked = await checkProject({
        projectRoot,
        mode: "development",
        generationId: `dev-${request.token.sourceToken}-${request.token.generationToken}`,
        signal: request.signal,
      });
      if (!checked.ok)
        throw new Error(formatDevDiagnostics(projectRoot, checked.diagnostics, color));
      if (configureTelemetry) {
        const graph = JSON.parse(checked.outputs.graph) as {
          nodes: { kind: string; telemetry?: TelemetryConfiguration }[];
        };
        await configureTelemetry(graph.nodes.find((node) => node.kind === "app")?.telemetry ?? {});
      }
      let local = localEnabled
        ? await reconcileLocalServices(projectRoot, checked, recipes, owner, request, backendPort)
        : undefined;
      owner = local?.owner ?? owner;
      const built = await buildProject({
        projectRoot,
        mode: "development",
        buildDirectory: request.outputDirectory,
        signal: request.signal,
        check: async () => checked,
        ...(local?.generationId === undefined
          ? {}
          : { providerOverridesGeneration: local.generationId }),
      });
      if (!built.ok) throw new Error(formatDevDiagnostics(projectRoot, built.diagnostics, color));
      if (local !== undefined && local.workerBindings.length > 0) {
        const workerOverridesFile = await prepareLocalWorkerOverrides(local.owner.overrideFile);
        const activated = await reconcileLocalServices(
          projectRoot,
          checked,
          recipes,
          local.owner,
          request,
          backendPort,
          true,
          localWorkerArtifacts(
            localPlanFrom(checked).services,
            local.workerBindings,
            request.outputDirectory,
            resolve(projectRoot, "node_modules"),
            workerOverridesFile,
          ),
        );
        if (activated === undefined) throw new Error("Local worker activation produced no owner.");
        local = activated;
        owner = local.owner;
      }
      return {
        entrypoint: "server/index.js",
        ...(local === undefined
          ? {}
          : {
              environment: {
                RELKIT_LOCAL_SERVICE_INSPECTOR_STATE: local.inspectorState,
                ...(local.generationId === undefined
                  ? {}
                  : {
                      RELKIT_PROVIDER_OVERRIDES_FILE: local.owner.overrideFile,
                      ...(local.workerBindings.length === 0 ? {} : { RELKIT_WORKER_ROLE: "api" }),
                    }),
              },
            }),
      };
    },
    close: async () => owner?.close(),
  });
}

export function formatDevDiagnostics(
  projectRoot: string,
  diagnostics: readonly Diagnostic[],
  color = false,
): string {
  if (diagnostics.length === 0) return "Project check failed.";
  return formatDiagnostics(diagnostics, {
    projectRoot,
    color,
    source: (file) => {
      try {
        return readFileSync(resolve(projectRoot, file), "utf8");
      } catch {
        return undefined;
      }
    },
  });
}
