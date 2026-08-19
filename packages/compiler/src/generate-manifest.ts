import { GENERATOR_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import { createDiagnostic, sortDiagnostics, type Diagnostic } from "@zsys/diagnostics";
import { hashGraph } from "@zsys/graph";
import type { NormalizedDescriptor, NormalizedGraph } from "./normalize-types.js";
import {
  descriptorsOf,
  importBindings,
  collectModules,
  providerTags,
  uniqueById,
  generatedFunctionDescriptors,
  type ImportBinding,
} from "./generate-manifest-utils.js";
import {
  applicationExpressionFor,
  functionExpressionsFor,
  functionTargetExpressionsFor,
  middlewareExpressionsFor,
  transformExpressionsFor,
} from "./generate-manifest-expressions.js";
import { renderManifest } from "./generate-manifest-format.js";

export const MANIFEST_CODES = Object.freeze({
  handler: "ZSYS_MANIFEST_HANDLER_MISSING",
  middleware: "ZSYS_MANIFEST_MIDDLEWARE_MISSING",
  transform: "ZSYS_MANIFEST_TRANSFORM_MISSING",
  mismatch: "ZSYS_GRAPH_MANIFEST_MISMATCH",
});

export interface ManifestGenerationInput {
  readonly graph?: NormalizedGraph;
  readonly graphHash: string;
  readonly descriptors: readonly NormalizedDescriptor[];
  readonly middleware?: readonly NormalizedDescriptor[];
  readonly transforms?: readonly NormalizedDescriptor[];
  readonly diagnostics?: readonly Diagnostic[];
  readonly projectRoot?: string;
  readonly generatedDirectory?: string;
}

export interface GeneratedManifest {
  readonly source: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly activatable: boolean;
}

/** Generates the executable manifest source after graph and semantic validation. */
export function generateManifest(input: ManifestGenerationInput): GeneratedManifest {
  const existing = input.diagnostics ?? [];
  if (existing.some((diagnostic) => diagnostic.severity === "error")) {
    return result("", [], false);
  }

  const diagnostics: Diagnostic[] = [];
  if (
    input.graph !== undefined &&
    hashGraph(input.graph, pathOptions(input.projectRoot)) !== input.graphHash
  ) {
    diagnostics.push(
      createDiagnostic(
        {
          code: MANIFEST_CODES.mismatch,
          severity: "error",
          message: "Runtime manifest graph hash does not match the canonical graph.",
        },
        pathOptions(input.projectRoot),
      ),
    );
  }

  const functions = [
    ...descriptorsOf(input.descriptors, "function"),
    ...generatedFunctionDescriptors(input.descriptors),
  ];
  const application = descriptorsOf(input.descriptors, "app")[0];
  const middleware = descriptorsOf(input.middleware ?? input.descriptors, "middleware");
  const transforms = descriptorsOf(input.transforms ?? input.descriptors, "transform");
  const functionById = uniqueById(functions, diagnostics);
  const modules = collectModules(
    functions,
    middleware,
    transforms,
    functionById,
    input,
    application,
  );
  const bindings = importBindings(modules);
  const functionExpressions = functionExpressionsFor(
    functions,
    functionById,
    bindings,
    input,
    diagnostics,
  );
  const targetExpressions = functionTargetExpressionsFor(functions, bindings, input);
  const applicationExpression = applicationExpressionFor(application, bindings, input);
  const transformExpressions = transformExpressionsFor(transforms, bindings, input, diagnostics);
  const middlewareExpressions = middlewareExpressionsFor(
    middleware,
    functionById,
    functionExpressions,
    diagnostics,
  );

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return result("", diagnostics, false);
  }
  return result(
    renderManifest(
      input,
      bindings,
      functionExpressions,
      targetExpressions,
      middlewareExpressions,
      transformExpressions,
      middleware,
      providerTags(input.descriptors),
      applicationExpression,
    ),
    diagnostics,
    true,
  );
}

function result(
  source: string,
  diagnostics: readonly Diagnostic[],
  activatable: boolean,
): GeneratedManifest {
  return Object.freeze({
    source,
    diagnostics: Object.freeze([...sortDiagnostics(diagnostics)]),
    activatable,
  });
}

export const MANIFEST_CONTRACT_VERSION = MANIFEST_VERSION;
export const MANIFEST_GENERATOR_VERSION = GENERATOR_VERSION;

function pathOptions(projectRoot: string | undefined): { readonly projectRoot?: string } {
  return projectRoot === undefined ? {} : { projectRoot };
}

export type { ImportBinding };
