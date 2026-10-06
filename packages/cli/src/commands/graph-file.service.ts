import { join, resolve } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { GRAPH_VERSION } from "@relkit/contracts";
import {
  canonicalGraphJson,
  canonicalizeGraph,
  diffGraph,
  hashGraph,
  validateGraphShapeEffect,
  type ApplicationGraph,
} from "@relkit/graph";
import { cliAdapterError, cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { GraphCommandError } from "./graph-error.js";
import { graphObjectSchema } from "./graph.schemas.js";
import type { GraphFileOperations, GraphFileOptions } from "./graph.types.js";

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Validated graph reads and comparisons with explicit filesystem authority. */
export class CliGraphFiles extends Context.Service<CliGraphFiles, GraphFileOperations>()(
  "relkit/cli/GraphFiles",
) {}

/**
 * Captures filesystem authority without acquiring or evaluating application code.
 * @returns A graph Layer requiring only CliFileSystem.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const result = await Effect.runPromise(CliGraphFiles.use((graphs) => graphs.check({})).pipe(Effect.provide(graphFilesLayer)));
 * ```
 */
export const graphFilesLive = Layer.effect(
  CliGraphFiles,
  Effect.gen(function* () {
    const files = yield* CliFileSystem;
    const read: GraphFileOperations["read"] = Effect.fn("GraphFiles.read")(
      function* (options: GraphFileOptions) {
        const root = resolve(options.projectRoot ?? process.cwd());
        const path = resolve(
          root,
          options.graphPath ?? join(".relkit", "generated", "application.graph.json"),
        );
        const value: unknown = yield* files.readText(path).pipe(
          Effect.flatMap((source) => cliTry("graph.json", () => JSON.parse(source))),
          Effect.mapError((error) => {
            const cause = cliOriginalError(error);
            const missing = cause instanceof Error && "code" in cause && cause.code === "ENOENT";
            return cliAdapterError(
              "graph.read",
              new GraphCommandError(
                missing ? "RELKIT_GRAPH_NOT_FOUND" : "RELKIT_GRAPH_INVALID",
                `Graph file ${missing ? "was not found" : "is not valid JSON"}: ${path}`,
              ),
            );
          }),
        );
        if (!Schema.is(graphObjectSchema)(value))
          return yield* invalid(path, "the root must be an object");
        if (value.contractVersion !== GRAPH_VERSION)
          return yield* Effect.fail(
            cliAdapterError(
              "graph.version",
              new GraphCommandError(
                "RELKIT_GRAPH_VERSION_UNSUPPORTED",
                `Graph contract version ${String(value.contractVersion)} is unsupported; expected ${GRAPH_VERSION}. Regenerate with \`relkit check\`: ${path}`,
              ),
            ),
          );
        yield* validateGraphShapeEffect(value, root).pipe(
          Effect.mapError((error) =>
            cliAdapterError(
              "graph.validate",
              new GraphCommandError(
                "RELKIT_GRAPH_INVALID",
                `Invalid graph ${path}: ${error.message}`,
              ),
            ),
          ),
        );
        // The owner's complete validator returns void, so promotion follows validation of every node and edge.
        const graph = canonicalizeGraph(value as unknown as ApplicationGraph, {
          projectRoot: root,
        });
        return Object.freeze({
          path,
          graph,
          hash: hashGraph(graph),
          json: canonicalGraphJson(graph),
        });
      },
      (effect) => observeCli("graph.read", effect),
    );
    return CliGraphFiles.of({
      read,
      print: Effect.fn("GraphFiles.print")(
        function* (options) {
          const loaded = yield* read(options);
          return Object.freeze({
            ok: true as const,
            command: "print" as const,
            graphPath: loaded.path,
            graphHash: loaded.hash,
            graph: loaded.graph,
          });
        },
        (effect) => observeCli("graph.print", effect),
      ),
      check: Effect.fn("GraphFiles.check")(
        function* (options) {
          const loaded = yield* read(options);
          if (options.expectedHash !== undefined) {
            yield* cliTry("graph.hash", () => assertHash(options.expectedHash!));
            if (options.expectedHash !== loaded.hash)
              return yield* Effect.fail(
                cliAdapterError(
                  "graph.hash",
                  new GraphCommandError(
                    "RELKIT_GRAPH_HASH_MISMATCH",
                    `Expected graph hash ${JSON.stringify(options.expectedHash)} but calculated ${JSON.stringify(loaded.hash)}.`,
                  ),
                ),
              );
          }
          return Object.freeze({
            ok: true as const,
            command: "check" as const,
            graphPath: loaded.path,
            graphHash: loaded.hash,
            ...(options.expectedHash === undefined ? {} : { expectedHash: options.expectedHash }),
          });
        },
        (effect) => observeCli("graph.check", effect),
      ),
      diff: Effect.fn("GraphFiles.diff")(
        function* (beforePath, afterPath, options) {
          const before = yield* read({ ...options, graphPath: beforePath });
          const after = yield* read({ ...options, graphPath: afterPath });
          return Object.freeze({
            ok: true as const,
            command: "diff" as const,
            beforePath: before.path,
            afterPath: after.path,
            beforeHash: before.hash,
            afterHash: after.hash,
            ...diffGraph(before.graph, after.graph),
          });
        },
        (effect) => observeCli("graph.diff", effect),
      ),
    });
  }),
);

/** Invocation graph with native filesystem authority provided explicitly. */
export const graphFilesLayer = graphFilesLive.pipe(Layer.provide(fileSystemLayer));

/**
 * Rejects malformed identities with the established command failure.
 * @param value - Expected graph hash.
 * @returns Void for a canonical identity.
 * @throws GraphCommandError for malformed hashes.
 */
function assertHash(value: string): void {
  if (!HASH_PATTERN.test(value))
    throw new GraphCommandError(
      "RELKIT_GRAPH_HASH_INVALID",
      "expected graph hash must use sha256:<64 lowercase hex>.",
    );
}

/**
 * Constructs typed validation failure without exposing raw document bytes.
 * @param path - Selected graph path.
 * @param detail - Owner-provided validation detail.
 * @returns A lazy failure retaining the public exception.
 */
function invalid(path: string, detail: string) {
  return Effect.fail(
    cliAdapterError(
      "graph.validate",
      new GraphCommandError("RELKIT_GRAPH_INVALID", `Invalid graph ${path}: ${detail}`),
    ),
  );
}
