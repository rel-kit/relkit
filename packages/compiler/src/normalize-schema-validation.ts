import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { schemaEntries, schemaEffect } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { schemaKey, taskSchemaKey } from "./normalize-utils.js";

/**
 * Projects directional schema contracts and records their hashes.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that projects directional schema contracts and records their hashes; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passSchemasEffect = Effect.fn("Compiler.passSchemas")(
  function* (work: NormalizationWork) {
    const seen = new Set<unknown>();
    const descriptors = [...work.descriptors, ...work.transformReferences.values()];
    yield* Effect.forEach(
      descriptors,
      (descriptor) =>
        Effect.gen(function* () {
          if (seen.has(descriptor.value)) return;
          seen.add(descriptor.value);
          yield* Effect.forEach(
            schemaEntries(descriptor),
            ([key, value, direction]) =>
              Effect.gen(function* () {
                yield* validateSchemaEffect(work, descriptor, key, value, direction);
              }),
            { discard: true },
          );
          if (descriptor.kind === "task") yield* validateTaskProjectionsEffect(work, descriptor);
          const value = isRecord(descriptor.value) ? descriptor.value : {};
          if (
            descriptor.kind === "function" &&
            value.invocationMode === "event-only" &&
            typeof value.event === "string"
          ) {
            const event = work.descriptors.find(
              (entry) => entry.kind === "event" && entry.id === value.event,
            );
            const eventValue = isRecord(event?.value) ? event.value : {};
            if (eventValue.input !== undefined) {
              yield* validateSchemaEffect(
                work,
                descriptor,
                schemaKey(descriptor.id, "input"),
                eventValue.input,
              );
            }
          }
          yield* Effect.forEach(
            requiredSchemaFields(descriptor.kind),
            (field) =>
              Effect.gen(function* () {
                if (descriptor.kind === "job" && isRecord(value.task)) return;
                const candidate =
                  descriptor.kind === "task" && field === "input"
                    ? (value.inputWire ?? value.input)
                    : value[field];
                if (value[field] === undefined)
                  yield* validateSchemaEffect(
                    work,
                    descriptor,
                    descriptor.kind === "task"
                      ? taskSchemaKey(descriptor.id, field, "output")
                      : schemaKey(descriptor.id, field),
                    candidate,
                    descriptor.kind === "task" ? "output" : undefined,
                  );
              }),
            { discard: true },
          );
          if (descriptor.kind === "transform")
            yield* validateSchemaEffect(
              work,
              descriptor,
              `${descriptor.id}:transform`,
              value.schema,
            );
          if (descriptor.kind === "route" && Array.isArray(value.responses)) {
            yield* Effect.forEach(
              value.responses,
              (response) =>
                Effect.gen(function* () {
                  if (isRecord(response) && response.schema !== undefined) {
                    yield* validateSchemaEffect(
                      work,
                      descriptor,
                      `${descriptor.id}:response:${String(response.id)}`,
                      response.schema,
                    );
                  }
                }),
              { discard: true },
            );
          }
        }),
      { discard: true },
    );
  },
  (effect, work) =>
    observeCompiler("normalization", "passSchemas", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Projects directional schema contracts and records their hashes.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passSchemas(work: NormalizationWork): void {
  return runCompilerSync(passSchemasEffect(work));
}

/**
 * Selects mandatory schema fields for a descriptor kind.
 * @param kind - Descriptor or syntax category.
 * @returns Schema fields required by the descriptor kind.
 */
function requiredSchemaFields(kind: string): readonly string[] {
  return (
    (
      {
        function: ["input", "output"],
        task: ["input", "output"],
        job: ["input"],
        event: ["input"],
        cache: ["key", "value"],
        agent: ["input", "output"],
        channel: ["params"],
        error: ["data"],
      } as Readonly<Record<string, readonly string[]>>
    )[kind] ?? []
  );
}

/**
 * Projects and indexes a directional schema or records unavailable evidence.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param key - Property or stable lookup key.
 * @param value - Declared metadata inspected without coercion.
 * @param direction - Selected input, output, or legacy wire direction.
 * @returns A lazy effect that projects and indexes a directional schema or records unavailable evidence; unexpected access failures remain defects.
 */
const validateSchemaEffect = Effect.fn("Compiler.validateSchema")(function* (
  work: NormalizationWork,
  descriptor: NormalizationWork["descriptors"][number],
  key: string,
  value: unknown,
  direction: import("./normalize-schema-projection.js").SchemaDirection = "legacy",
) {
  const result = yield* schemaEffect(value, direction);
  if (!result.ok)
    add(
      work,
      descriptor,
      NORMALIZE_CODES.schema,
      `${key} cannot produce deterministic JSON Schema: ${result.reason ?? "unavailable"}.`,
    );
  else if (result.schema !== undefined) {
    work.schemas.set(key, result.schema);
    if (result.contractHash !== undefined) work.schemaHashes.set(key, result.contractHash);
  }
});

/**
 * Checks task wire projections and canonical input requirements.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns A lazy effect that checks task wire projections and canonical input requirements; unexpected access failures remain defects.
 */
const validateTaskProjectionsEffect = Effect.fn("Compiler.validateTaskProjections")(function* (
  work: NormalizationWork,
  descriptor: NormalizationWork["descriptors"][number],
) {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const input = yield* schemaEffect(value.input, "input");
  const canonicalInput = yield* schemaEffect(value.inputWire ?? value.input, "output");
  const output = yield* schemaEffect(value.output, "output");
  if (input.transformed === true && value.inputWire === undefined) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.jobProjection,
      "Task input transforms require an identity-preserving inputWire schema.",
      "error",
      undefined,
      "Declare inputWire with equal input/output types and no transformation.",
    );
  }
  if (value.inputWire !== undefined && !canonicalInput.ok) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.jobProjection,
      "Task inputWire cannot produce a faithful canonical JSON Schema.",
    );
  }
  if (output.transformed === true) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.jobProjection,
      "Task output must validate canonical values without a transformation.",
    );
  }
});

/**
 * Recognizes nonnull nonarray objects for metadata inspection.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a nonnull, nonarray metadata object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
