/** Captures exactly selected installed runtime packages for portable production installs. */
import { Effect, Schema } from "effect";
import { IntegrationDependencyRequirements } from "@relkit/contracts";
import { DependencySource, SelectedDependencies } from "@relkit/provider/internal/dependencies";
import { cliAdapterError } from "../cli-errors.js";
import { HTTP_TRANSPORT_REQUIREMENTS } from "@relkit/runtime-hono/internal/prepared";
import type { ApplicationGraph } from "@relkit/graph";
import type {
  DependencySourceContract,
  InstalledPackageIdentity,
} from "@relkit/provider/internal/dependencies";
import type { ProductionSelection } from "./build-production.types.js";
import { resolveProductionDependency } from "../services/production-dependency-source.js";

const Plan = Schema.Struct({
  integrations: Schema.Array(
    Schema.Struct({
      packageName: Schema.String,
      packageVersion: Schema.String,
      capability: Schema.String,
      requirements: Schema.optionalKey(IntegrationDependencyRequirements),
    }),
  ),
});

/**
 * Retains selected adapter/native SDK versions without installing or loading exports.
 * @param root - Consuming application's physical root.
 * @param source - Accepted compiler runtime plan source.
 * @param graph - Accepted graph selecting specialized database/auth boundaries.
 * @returns Exact production dependencies; deploy-only and unused peers stay absent.
 */
export const captureProductionDependencies = Effect.fn("Project.productionDependencies")(function* (
  root: string,
  source: string,
  graph: ApplicationGraph,
  httpCapabilities: readonly string[],
) {
  const plan = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Plan))(source).pipe(
    Effect.mapError((cause) => cliAdapterError("build.productionPlan", cause)),
  );
  const packages = yield* DependencySource;
  const checker = yield* SelectedDependencies;
  const selected = [
    ...plan.integrations.map((entry) => ({ ...entry, capabilities: [entry.capability] })),
    ...specializedSelections(graph),
    ...(httpCapabilities.length === 0
      ? []
      : [
          {
            packageName: "@relkit/runtime-hono",
            packageVersion: undefined,
            capabilities: httpCapabilities,
            requirements: HTTP_TRANSPORT_REQUIREMENTS,
          },
        ]),
  ];
  const dependencies = new Map<string, string>();
  for (const entry of selected)
    yield* captureSelectedPackage(packages, checker, dependencies, root, entry);
  return Object.fromEntries([...dependencies].sort(([left], [right]) => left.localeCompare(right)));
});

/** Validates one selected owner from its consumer and peers from that canonical owner. */
const captureSelectedPackage = Effect.fn("Project.selectedProductionPackage")(function* (
  packages: DependencySourceContract,
  checker: typeof SelectedDependencies.Service,
  dependencies: Map<string, string>,
  root: string,
  entry: ProductionSelection,
) {
  const identity = yield* resolveProductionDependency(packages, entry.packageName, root).pipe(
    Effect.mapError((cause) => cliAdapterError("build.productionDependency", cause)),
  );
  if (
    identity === null ||
    (entry.packageVersion !== undefined && identity.version !== entry.packageVersion)
  )
    return yield* cliAdapterError(
      "build.productionDependency",
      new Error(`Selected package ${entry.packageName} changed; run relkit build again.`),
    );
  yield* includeProductionIdentity(dependencies, identity);
  const installed = yield* checker
    .check({
      projectRoot: root,
      adapter: entry.packageName,
      adapterRoot: identity.root,
      capabilities: entry.capabilities,
      phase: "runtime",
      requirements: entry.requirements ?? identity.requirements ?? [],
    })
    .pipe(Effect.mapError((cause) => cliAdapterError("build.productionDependency", cause)));
  for (const peer of installed) yield* includeProductionIdentity(dependencies, peer);
});

/** Rejects incompatible duplicate selections before emitting a single normal dependency. */
const includeProductionIdentity = Effect.fn("Project.productionPackageIdentity")(function* (
  dependencies: Map<string, string>,
  identity: Pick<InstalledPackageIdentity, "name" | "version">,
) {
  const previous = dependencies.get(identity.name);
  if (previous !== undefined && previous !== identity.version)
    return yield* cliAdapterError(
      "build.productionDependency",
      new Error(
        `Selected runtime packages require different installed versions of ${identity.name}.`,
      ),
    );
  dependencies.set(identity.name, identity.version);
});

/**
 * Special service packages expose their requirements through the same package metadata.
 * @param graph - Compiled graph containing native database and authentication service selections.
 * @returns Native database/authentication selections whose requirements use installed package metadata.
 */
function specializedSelections(graph: ApplicationGraph) {
  return graph.nodes.flatMap((node) => {
    if (node.kind !== "service") return [];
    const capability = node.capability?.kind;
    if (capability !== "drizzle" && capability !== "better-auth") return [];
    return [
      {
        packageName: `@relkit/${capability}`,
        capabilities: [capability],
        packageVersion: undefined,
        requirements: undefined,
      },
    ];
  });
}
