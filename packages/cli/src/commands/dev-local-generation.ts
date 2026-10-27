/** Executes one serialized generation with initial-check reuse, typed diagnostics and local worker activation. */
import { Effect, Ref } from "effect";
import type { CandidateCompile, CandidateCompileRequest } from "@relkit/supervisor";
import { DEFAULT_TOOLING_CONFIG } from "@relkit/compiler";
import { cliTry } from "../cli-errors.js";
import { CliProject } from "../services/project.service.js";
import { formatDevDiagnostics } from "./dev-local-diagnostics.js";
import { telemetryConfigurationFromGraphEffect } from "./dev-telemetry-config.js";
import {
  reconcileGenerationServices,
  activateGenerationWorkers,
} from "./dev-generation-services.js";
import type { DevCompilerOptions } from "./dev-local.types.js";
import type { DevGenerationState } from "./dev-local-generation.types.js";
import type { DevLocalReconcileResult } from "./dev-local-services.types.js";

/**
 * Builds an accepted generation using the caller's captured project authority.
 * @param options - Session policy and telemetry configuration hook.
 * @param state - Session-owned refs/cache/resource scope; caller serializes access.
 * @param request - Candidate destination and generation identity.
 * @returns Lazy build receipt; check/build failures remain CliAdapterError.
 */
export const compileDevGenerationEffect = Effect.fn("Dev.compileGeneration")(function* (
  options: DevCompilerOptions,
  state: DevGenerationState,
  request: CandidateCompileRequest,
) {
  const project = yield* CliProject;
  const checked = yield* selectGenerationCheck(options, state, request);
  const configure = options.configureTelemetry;
  if (configure !== undefined)
    yield* telemetryConfigurationFromGraphEffect(checked.outputs.graph).pipe(
      Effect.flatMap((configuration) => configure(configuration)),
    );
  const inspection =
    options.configureInspector === undefined
      ? undefined
      : yield* options.configureInspector(
          (checked.config ?? DEFAULT_TOOLING_CONFIG).inspector,
          request,
        );
  let local = yield* reconcileGenerationServices(options, state, checked);
  const built = yield* project.build({
    projectRoot: options.projectRoot,
    mode: "development",
    buildDirectory: request.outputDirectory,
    check: async () => checked,
    ...(local?.generationId === undefined
      ? {}
      : { providerOverridesGeneration: local.generationId }),
  });
  if (!built.ok)
    return yield* cliTry("dev.build.diagnostics", () => {
      throw new Error(formatDevDiagnostics(options.projectRoot, built.diagnostics, options.color));
    });
  local = yield* activateGenerationWorkers(options, state, checked, request, local);
  return generationReceipt(local, inspection);
});

/**
 * Selects one initial result or a fresh scoped compiler check and rejects diagnostics.
 * @param options - Session project and diagnostic color policy.
 * @param state - Single-use check and shutdown admission state.
 * @param request - Fresh generation identity when reuse is unavailable.
 * @returns Accepted validation evidence; typed transport/diagnostic failures remain visible.
 */
const selectGenerationCheck = Effect.fn("Dev.selectGenerationCheck")(function* (
  options: DevCompilerOptions,
  state: DevGenerationState,
  request: CandidateCompileRequest,
) {
  const project = yield* CliProject;
  if (yield* Ref.get(state.closing))
    return yield* cliTry("dev.compiler.closed", () => {
      throw new Error("Development compiler is closed.");
    });
  const initial = yield* Ref.getAndSet(state.initialCheck, undefined);
  const reused = initial === undefined ? undefined : yield* initial;
  const checked =
    reused ??
    (yield* project.checkDevelopment({
      projectRoot: options.projectRoot,
      generationId: `dev-${request.token.sourceToken}-${request.token.generationToken}`,
    }));
  if (!checked.ok)
    return yield* cliTry("dev.compiler.diagnostics", () => {
      throw new Error(
        formatDevDiagnostics(options.projectRoot, checked.diagnostics, options.color),
      );
    });
  return checked;
});

/**
 * Projects local reconciliation and inspection evidence into the supervisor's build receipt.
 * @param local - Optional accepted local services and worker environment.
 * @param inspection - Optional inspector credentials selected by this generation's policy.
 * @returns Backend entrypoint and only the environment selected by this generation.
 */
function generationReceipt(
  local: DevLocalReconcileResult | undefined,
  inspection: Readonly<Record<string, string | undefined>> | undefined,
): Awaited<ReturnType<CandidateCompile>> {
  return {
    entrypoint: "server/index.js",
    ...(local === undefined && inspection === undefined
      ? {}
      : {
          environment: {
            ...inspection,
            ...(local === undefined
              ? {}
              : {
                  RELKIT_LOCAL_SERVICE_INSPECTOR_STATE: local.inspectorState,
                  ...(local.generationId === undefined
                    ? {}
                    : {
                        RELKIT_PROVIDER_OVERRIDES_FILE: local.owner.overrideFile,
                        ...(local.workerBindings.length ? { RELKIT_WORKER_ROLE: "api" } : {}),
                      }),
                }),
          },
        }),
  };
}
