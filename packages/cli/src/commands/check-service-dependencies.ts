/** Validates graph-selected native services through their owning manifest metadata. */
import { Effect, Schema } from "effect";
import { SelectedDependencies } from "@relkit/provider/internal/dependencies";
import type { AstPrefilterCandidate } from "@relkit/compiler";
import { cliAdapterError } from "../cli-errors.js";

const Graph = Schema.Struct({ nodes: Schema.Array(Schema.Json) });
const Service = Schema.Struct({
  kind: Schema.Literal("service"),
  source: Schema.optional(Schema.Struct({ file: Schema.String })),
  capability: Schema.Struct({ kind: Schema.String, dialect: Schema.optional(Schema.String) }),
});

/**
 * Checks native service declarations before their schema modules can evaluate.
 * @param projectRoot - Consumer resolution root; runner directories are excluded.
 * @param candidates - Existing compiler AST facts without a second source parser.
 * @returns Metadata-derived checks for intrinsically native service authoring paths.
 */
export const checkSourceServiceRequirements = Effect.fn("Project.sourceServiceDependencies")(
  function* (projectRoot: string, candidates: readonly AstPrefilterCandidate[]) {
    const checker = yield* SelectedDependencies;
    yield* Effect.forEach(
      candidates,
      (candidate) => {
        const factories = candidate.facts.factoryBindings.map((binding) => binding.factory);
        const selected: string[] = [];
        if (
          factories.includes("defineDrizzleService") ||
          candidate.imports.includes("@relkit/drizzle") ||
          candidate.imports.some((name) => /^@relkit\/drizzle\/(?:sqlite|pg|mysql)$/.test(name))
        )
          selected.push("drizzle");
        if (
          factories.includes("defineBetterAuthService") ||
          candidate.imports.includes("@relkit/better-auth") ||
          candidate.imports.includes("@relkit/better-auth/drizzle")
        )
          selected.push("better-auth");
        return Effect.forEach(
          selected,
          (kind) =>
            checker.check({
              projectRoot,
              adapter: `@relkit/${kind}`,
              capabilities: [kind],
              phase: "check",
              source: candidate.fileName,
            }),
          { concurrency: 1, discard: true },
        );
      },
      { concurrency: 1, discard: true },
    ).pipe(Effect.mapError((cause) => cliAdapterError("project.sourceServiceDependencies", cause)));
  },
);

/** Uses the same service capabilities already selected by the native server producer. */
export const checkSelectedServiceRequirements = Effect.fn("Project.serviceDependencies")(function* (
  projectRoot: string,
  encodedGraph: string,
) {
  if (encodedGraph === "") return;
  const graph = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Graph))(encodedGraph).pipe(
    Effect.mapError((cause) => cliAdapterError("project.dependencyGraph", cause)),
  );
  const services = graph.nodes
    .filter(Schema.is(Service))
    .filter((node) => node.capability.kind === "better-auth" || node.capability.kind === "drizzle");
  const checker = yield* SelectedDependencies;
  yield* Effect.forEach(
    services,
    (node) =>
      checker.check({
        projectRoot,
        adapter: `@relkit/${node.capability.kind}`,
        capabilities:
          node.capability.kind === "drizzle" && node.capability.dialect === "mysql"
            ? ["drizzle", "mysql"]
            : [node.capability.kind],
        phase: "check",
        ...(node.source === undefined ? {} : { source: node.source.file }),
      }),
    { concurrency: 1, discard: true },
  ).pipe(Effect.mapError((cause) => cliAdapterError("project.serviceDependencies", cause)));
});
