/** Selects engine operations from the accepted graph without acquiring providers. */
import type { ApplicationGraph } from "@relkit/graph";

/**
 * Emits only engine operations required by this graph and inert unselected stubs.
 * @param graph - Accepted compiler graph.
 * @returns Static imports and placeholders used by the shared server emitter.
 */
export function serverEngineImports(graph: ApplicationGraph) {
  const hasJobs = graph.nodes.some(
    (node) =>
      node.kind === "job" ||
      node.kind === "task" ||
      (node.kind === "trigger" &&
        node.config !== null &&
        typeof node.config === "object" &&
        "kind" in node.config &&
        node.config.kind === "queue"),
  );
  const hasEvents = graph.nodes.some((node) => node.kind === "event");
  const imports = [
    "assertRuntimeIntegrationModules",
    "createFunctionRegistry",
    "createProviderRegistry",
    ...(hasJobs ? ["createTaskExecutor"] : []),
    "invoke",
    ...(hasEvents ? ["materializeEvents"] : []),
    ...(hasJobs ? ["materializeJobs"] : []),
    "parseInfrastructureBindingValues",
  ].join(", ");
  const stubs = `${hasJobs ? "" : "const createTaskExecutor = () => undefined;\nconst materializeJobs = async () => undefined;"}
${hasEvents ? "" : "const materializeEvents = async () => undefined;"}`;
  return { imports, stubs };
}
