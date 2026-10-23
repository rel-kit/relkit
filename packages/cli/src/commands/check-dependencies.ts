/**
 * Performs declaration-only integration discovery before avoidable evaluation,
 * then validates graph-selected SDK requirements before publishing preparation.
 * Resolver authority remains a captured provider service and never installs code.
 */
import { Effect, Schema } from "effect";
import { prefilterSources } from "@relkit/compiler";
import { IntegrationDependencyRequirements } from "@relkit/contracts";
import { SelectedDependencies } from "@relkit/provider/internal/dependencies";
import { CliCompiler } from "../services/compiler.service.js";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import type { CheckSource } from "./check.types.js";
import { checkSourceServiceRequirements } from "./check-service-dependencies.js";
import { resolve } from "node:path";

const Plan = Schema.Struct({
  integrations: Schema.Array(
    Schema.Struct({
      packageName: Schema.String,
      capability: Schema.String,
      requirements: Schema.optional(IntegrationDependencyRequirements),
    }),
  ),
});

/**
 * Resolves literal RELKIT imports using existing AST facts without evaluation.
 * @param projectRoot - Actual consuming application root.
 * @param sources - Unevaluated source snapshots already owned by the caller.
 * @param configurationPath - Exact selected config remains strict even under excluded source paths.
 * @returns Lazy validated integration metadata or original compiler I/O failure.
 */
export const preflightSourceImports = Effect.fn("Project.preflightImports")(function* (
  projectRoot: string,
  sources: readonly CheckSource[],
  configurationPath = "relkit.config.ts",
) {
  const compiler = yield* CliCompiler;
  const candidates = yield* cliTry("project.dependencyImports", () =>
    sourceIntegrationCandidates(projectRoot, sources, configurationPath),
  );
  yield* checkSourceServiceRequirements(projectRoot, candidates);
  const packages = yield* compiler.integrationPackages(
    sourceIntegrationImports(projectRoot, candidates, configurationPath),
  );
  const checker = yield* SelectedDependencies;
  yield* Effect.forEach(
    packages,
    (entry) => {
      // Intrinsically native agent declarations require execution peers, while
      // multi-capability metadata never activates an unrelated optional peer.
      const capabilities =
        entry.integrationId === "langchain"
          ? ["agent-execution"]
          : entry.registrations.length === 1
            ? entry.registrations.map((item) => item.capability)
            : [];
      const source = candidates.find((candidate) =>
        candidate.imports.some(
          (name) => name === entry.packageName || name.startsWith(`${entry.packageName}/`),
        ),
      )?.fileName;
      return checker.check({
        projectRoot,
        adapter: entry.packageName,
        capabilities,
        phase: "check",
        requirements: entry.requirements ?? [],
        ...(source === undefined ? {} : { source }),
      });
    },
    { concurrency: 1, discard: true },
  ).pipe(Effect.mapError((cause) => cliAdapterError("project.dependencyImports", cause)));
  return packages;
});

/** Separates strict configuration definitions from ordinary source helper imports. */
export function sourceIntegrationImports(
  projectRoot: string,
  candidates: ReturnType<typeof prefilterSources>["candidates"],
  configurationPath = "relkit.config.ts",
  forceAgent = false,
) {
  const config = resolve(projectRoot, configurationPath);
  const imports = candidates
    .filter((candidate) => resolve(projectRoot, candidate.fileName) === config)
    .flatMap((candidate) => candidate.imports);
  const applicationImports = candidates
    .filter((candidate) => resolve(projectRoot, candidate.fileName) !== config)
    .flatMap((candidate) => candidate.imports);
  const agent =
    forceAgent ||
    candidates.some((candidate) =>
      candidate.facts.factoryBindings.some((binding) => binding.kind === "agent"),
    );
  if (agent && ![...imports, ...applicationImports].includes("@relkit/langchain"))
    imports.push("@relkit/langchain");
  return { projectRoot, imports, applicationImports };
}

/** Keeps the selected configuration in preflight while retaining ordinary application exclusions. */
export function sourceIntegrationCandidates(
  projectRoot: string,
  sources: readonly CheckSource[],
  configurationPath = "relkit.config.ts",
  exclude?: readonly string[],
) {
  const config = resolve(projectRoot, configurationPath);
  const configuration = sources.filter(
    (source) => resolve(projectRoot, source.fileName) === config,
  );
  const application = sources.filter((source) => resolve(projectRoot, source.fileName) !== config);
  return [
    ...prefilterSources(configuration, { projectRoot, exclude: [] }).candidates,
    ...prefilterSources(application, { projectRoot, ...(exclude === undefined ? {} : { exclude }) })
      .candidates,
  ];
}

/**
 * Revalidates selected check-phase SDKs before generated artifacts become valid.
 * @param projectRoot - Consumer boundary used for adapter resolution.
 * @param encodedPlan - Generated accepted plan JSON; an empty failed plan is skipped.
 * @returns Lazy validation; original typed dependency failures are retained as CLI causes.
 */
export const checkSelectedRequirements = Effect.fn("Project.selectedDependencies")(function* (
  projectRoot: string,
  encodedPlan: string,
) {
  if (encodedPlan === "") return;
  const plan = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Plan))(encodedPlan).pipe(
    Effect.mapError((cause) => cliAdapterError("project.dependencyPlan", cause)),
  );
  if (!plan.integrations.some((entry) => (entry.requirements?.length ?? 0) > 0)) return;
  const checker = yield* SelectedDependencies;
  yield* Effect.forEach(
    plan.integrations,
    (entry) =>
      checker.check({
        projectRoot,
        adapter: entry.packageName,
        capabilities: [entry.capability],
        phase: "check",
        requirements: entry.requirements ?? [],
      }),
    { concurrency: 1, discard: true },
  ).pipe(Effect.mapError((cause) => cliAdapterError("project.selectedDependencies", cause)));
});
