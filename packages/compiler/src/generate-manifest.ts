import type { GraphCompilationFailure } from "./normalize-graph.types.js";
import type { ImportBinding } from "./generate-manifest-utils.types.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type { ManifestGenerationInput, GeneratedManifest } from "./generate-manifest.types.js";
export type { ManifestGenerationInput, GeneratedManifest } from "./generate-manifest.types.js";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import { createDiagnostic, sortDiagnostics, type Diagnostic } from "@relkit/diagnostics";
import { hashGraphEffect } from "@relkit/graph";

import {
  descriptorsOf,
  importBindings,
  collectModules,
  uniqueById,
  generatedFunctionDescriptors,
} from "./generate-manifest-utils.js";
import {
  applicationExpressionFor,
  descriptorExpressionsFor,
  functionExpressionsFor,
  functionTargetExpressionsFor,
  jobExpressionsFor,
  taskExpressionsFor,
  hookExpressionsFor,
  middlewareExpressionsFor,
  transformExpressionsFor,
} from "./generate-manifest-expressions.js";
import { renderManifest } from "./generate-manifest-format.js";
import { identityBindingStatements } from "./generate-manifest-identities.js";

export const MANIFEST_CODES = Object.freeze({
  handler: "RELKIT_MANIFEST_HANDLER_MISSING",
  middleware: "RELKIT_MANIFEST_MIDDLEWARE_MISSING",
  transform: "RELKIT_MANIFEST_TRANSFORM_MISSING",
  mismatch: "RELKIT_GRAPH_MANIFEST_MISMATCH",
});

/**
 * Renders executable manifest source after graph and semantic validation.
 * @param input - Compiler input and source provenance.
 * @returns A lazy effect that renders executable manifest source after graph and semantic validation; unexpected access failures remain defects.
 */
export const generateManifestEffect: (
  input: ManifestGenerationInput,
) => Effect.Effect<GeneratedManifest, GraphCompilationFailure> = Effect.fn(
  "Compiler.generateManifest",
)(
  function* (
    input: ManifestGenerationInput,
  ): Effect.fn.Return<GeneratedManifest, GraphCompilationFailure> {
    const existing = input.diagnostics ?? [];
    if (existing.some((diagnostic) => diagnostic.severity === "error")) {
      return result("", [], false);
    }

    const diagnostics: Diagnostic[] = [];
    if (
      input.graph !== undefined &&
      (yield* hashGraphEffect(input.graph, pathOptions(input.projectRoot))) !== input.graphHash
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
    const agents = descriptorsOf(input.descriptors, "agent");
    const channels = descriptorsOf(input.descriptors, "channel");
    const tools = descriptorsOf(input.descriptors, "tool");
    const routes = descriptorsOf(input.descriptors, "route");
    const constants = descriptorsOf(input.descriptors, "constants");
    const prompts = descriptorsOf(input.descriptors, "prompt");
    const services = descriptorsOf(input.descriptors, "service");
    const events = descriptorsOf(input.descriptors, "event");
    const tasks = descriptorsOf(input.descriptors, "task");
    const jobs = descriptorsOf(input.descriptors, "job").filter((descriptor) => {
      const value = descriptor.value;
      return (
        value !== null && typeof value === "object" && !Array.isArray(value) && "task" in value
      );
    });
    const functionById = uniqueById(functions, diagnostics);
    const modules = collectModules(functions, middleware, transforms, input, application, [
      ...input.descriptors,
      ...agents,
      ...tools,
      ...events,
      ...channels,
      ...tasks,
      ...jobs,
    ]);
    const bindings = importBindings(modules);
    const identityBindings = identityBindingStatements(input.descriptors, bindings, input);
    const functionExpressions = functionExpressionsFor(
      functions,
      functionById,
      bindings,
      input,
      diagnostics,
    );
    const targetExpressions = functionTargetExpressionsFor(functions, bindings, input);
    const applicationExpression = applicationExpressionFor(application, bindings, input);
    const agentExpressions = descriptorExpressionsFor(agents, bindings, input);
    const channelExpressions = descriptorExpressionsFor(channels, bindings, input);
    const toolExpressions = descriptorExpressionsFor(tools, bindings, input);
    const routeExpressions = descriptorExpressionsFor(routes, bindings, input);
    const constantExpressions = descriptorExpressionsFor(constants, bindings, input);
    const promptExpressionsById = descriptorExpressionsFor(prompts, bindings, input);
    const promptExpressions = new Map(
      prompts.flatMap((descriptor) => {
        const expression = promptExpressionsById.get(descriptor.id);
        return expression === undefined ? [] : [[descriptor.exportName, expression] as const];
      }),
    );
    const serviceExpressions = descriptorExpressionsFor(services, bindings, input);
    const taskExpressions = taskExpressionsFor(tasks, bindings, input);
    const jobExpressions = jobExpressionsFor(jobs, bindings, input, taskExpressions);
    const transformExpressions = transformExpressionsFor(transforms, bindings, input, diagnostics);
    const middlewareExpressions = middlewareExpressionsFor(
      middleware,
      bindings,
      input,
      diagnostics,
    );
    const hookExpressions = hookExpressionsFor([...functions, ...tools, ...tasks], bindings, input);

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
        hookExpressions,
        transformExpressions,
        applicationExpression,
        agentExpressions,
        channelExpressions,
        toolExpressions,
        routeExpressions,
        constantExpressions,
        promptExpressions,
        serviceExpressions,
        taskExpressions,
        jobExpressions,
        identityBindings,
      ),
      diagnostics,
      true,
    );
  },
  (effect, input) =>
    observeCompiler("generation", "generateManifest", effect, () => ({
      descriptors: input.descriptors.length,
      diagnostics: input.diagnostics?.length ?? 0,
    })),
);

/**
 * Renders executable manifest source after graph and semantic validation.
 * @param input - Compiler input and source provenance.
 * @returns Generated source, diagnostics, and activation eligibility.
 */
export function generateManifest(input: ManifestGenerationInput): GeneratedManifest {
  return runCompilerSync(generateManifestEffect(input));
}

/**
 * Freezes generated source, diagnostics, and activation eligibility.
 * @param source - Source provenance or exact generated content.
 * @param diagnostics - Ordered compiler diagnostics.
 * @param activatable - Whether generation has no blocking diagnostics.
 * @returns A frozen generated manifest result.
 */
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

/**
 * Includes a project root only when the caller supplied it.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns Project-root options only when a root was supplied.
 */
function pathOptions(projectRoot: string | undefined): { readonly projectRoot?: string } {
  return projectRoot === undefined ? {} : { projectRoot };
}

export type { ImportBinding };
