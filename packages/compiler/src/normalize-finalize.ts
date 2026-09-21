import type { RuntimeIntegrationPlan } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import { hashGraph } from "./normalize-graph.js";
import { generateManifest } from "./generate-manifest.js";
import { generateJobsManifest } from "./jobs/manifest.js";
import { makeOutputs } from "./normalize-output.js";
import type { NormalizationWork } from "./normalize-types.js";
import { generateLocalServicePlan } from "./local-service-plan.js";
import {
  generateRuntimeIntegrationPlan,
  RuntimeIntegrationPlanError,
} from "./runtime-integration-plan.js";

export function passOutputs(work: NormalizationWork): void {
  if (work.graph === undefined) return;
  const hash = hashGraph(work.graph);
  work.graphHash = hash;
  let runtimeIntegrations: RuntimeIntegrationPlan | undefined;
  try {
    runtimeIntegrations = generateRuntimeIntegrationPlan(
      work.graph,
      hash,
      work.input.runtimeIntegrationPackages,
    );
  } catch (error) {
    if (!(error instanceof RuntimeIntegrationPlanError)) throw error;
    work.diagnostics.push(
      createDiagnostic({ code: error.code, severity: "error", message: error.message }),
    );
  }
  const manifest = generateManifest({
    graph: work.graph,
    graphHash: hash,
    descriptors: work.descriptors,
    middleware: [...work.middlewareReferences.values()],
    transforms: [...work.transformReferences.values()],
    diagnostics: work.diagnostics,
    ...(work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot }),
  });
  work.diagnostics.push(...manifest.diagnostics);
  const jobsManifest = hasTaskJobs(work)
    ? generateJobsManifest({
        graph: work.graph,
        graphHash: hash,
        descriptors: work.descriptors,
        diagnostics: work.diagnostics,
        work,
        ...(work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot }),
      })
    : undefined;
  if (jobsManifest !== undefined) work.diagnostics.push(...jobsManifest.diagnostics);
  const localServices = generateLocalServicePlan(work.graph, hash);
  work.outputs = makeOutputs(
    work.graph,
    hash,
    sortDiagnostics(work.diagnostics),
    work,
    manifest,
    jobsManifest,
    runtimeIntegrations,
    localServices,
  );
  if (work.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    work.outputs = Object.freeze({
      ...work.outputs,
      manifest: "",
      ...(hasTaskJobs(work) ? { jobsManifest: "" } : {}),
      runtimeActivation: "",
      runtimeIntegrations: "",
      runtimeIntegrationImports: "",
      localServices: "",
    });
  }
}

export function hasTaskJobs(work: NormalizationWork): boolean {
  return work.descriptors.some(
    (descriptor) =>
      descriptor.kind === "task" ||
      (descriptor.kind === "job" &&
        descriptor.value !== null &&
        typeof descriptor.value === "object" &&
        !Array.isArray(descriptor.value) &&
        "task" in descriptor.value),
  );
}

export function sortDiagnostics<
  T extends {
    code: string;
    severity: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
  },
>(diagnostics: readonly T[]): T[] {
  return [...diagnostics].sort(
    (left, right) =>
      (left.file ?? "").localeCompare(right.file ?? "") ||
      (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) ||
      (left.column ?? Number.MAX_SAFE_INTEGER) - (right.column ?? Number.MAX_SAFE_INTEGER) ||
      left.code.localeCompare(right.code) ||
      left.severity.localeCompare(right.severity) ||
      left.message.localeCompare(right.message),
  );
}
