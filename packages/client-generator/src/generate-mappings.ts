import type { MappingLeaf, ResponseContract } from "./generate-mappings.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import { recordCalculation } from "./generate-schema-render.js";
/** Traverses request mappings and returns stable, sorted mapping leaves.
 * @param value - Unknown request mapping.
 * @returns An Effect yielding ordered leaves; it has no expected failure.
 * @example Effect.runSync(mappingCalculations.collectEffect({ kind: "input", fields: {} }));
 */
const collectMappingsCore = Effect.fnUntraced(function* (value: unknown) {
  const result: MappingLeaf[] = [];
  yield* visitMapping(value, [], false, false, result);
  return result.sort(
    (left, right) =>
      left.inputPath.join(".").localeCompare(right.inputPath.join(".")) ||
      left.kind.localeCompare(right.kind) ||
      (left.name ?? "").localeCompare(right.name ?? ""),
  );
});
/** Walks nested mapping fields and propagates optional/default flags.
 * @param value - Current mapping node.
 * @param path - Input path accumulated so far.
 * @param optional - Whether an ancestor is optional.
 * @param defaulted - Whether an ancestor has a default.
 * @param result - Leaf accumulator.
 * @returns An Effect updating the accumulator; it has no expected failure.
 * @example Effect.runSync(visitMapping({ kind: "path" }, [], false, false, []));
 */
const visitMapping: (
  value: unknown,
  path: readonly string[],
  optional: boolean,
  defaulted: boolean,
  result: MappingLeaf[],
) => Effect.Effect<void> = Effect.fnUntraced(function* (
  value: unknown,
  path: readonly string[],
  optional: boolean,
  defaulted: boolean,
  result: MappingLeaf[],
) {
  const document = yield* recordCalculation(value);
  if (document === undefined || typeof document.kind !== "string") return;
  const fields = yield* recordCalculation(document.fields);
  if ((document.kind === "input" || document.kind === "nested") && fields !== undefined) {
    for (const key of Object.keys(fields).sort())
      yield* visitMapping(fields[key], [...path, key], optional, defaulted, result);
    return;
  }
  if (
    document.kind === "optional" ||
    document.kind === "default" ||
    document.kind === "transform"
  ) {
    yield* visitMapping(
      document.value,
      path,
      optional || document.kind === "optional",
      defaulted || document.kind === "default",
      result,
    );
    return;
  }
  result.push({
    inputPath: path,
    outputPath:
      document.kind === "body" || document.kind === "multipart" || document.kind === "multipart-all"
        ? [typeof document.name === "string" ? document.name : (path.at(-1) ?? "value")]
        : path,
    kind: document.kind,
    ...(typeof document.name === "string" ? { name: document.name } : {}),
    ...(document.kind === "constant" ? { value: document.value } : {}),
    optional,
    defaulted,
  });
});
/** Normalizes response entries and adds the default validation response.
 * @param value - Unknown HTTP response metadata.
 * @returns An Effect yielding ordered responses; it has no expected failure.
 * @example Effect.runSync(mappingCalculations.responsesEffect([]));
 */
const responseContractsCore = Effect.fnUntraced(function* (value: unknown) {
  const responses: ResponseContract[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const entry = yield* recordCalculation(item);
    if (entry === undefined) continue;
    responses.push({
      id: typeof entry.id === "string" ? entry.id : "response",
      kind: typeof entry.kind === "string" ? entry.kind : "response",
      status: typeof entry.status === "number" ? entry.status : 0,
      ...(typeof entry.errorId === "string" ? { errorId: entry.errorId } : {}),
      ...(entry.schema === undefined || entry.schema === null ? {} : { schema: entry.schema }),
    });
  }
  if (!responses.some((response) => response.kind === "validation-error")) {
    responses.push({ id: "validation.422", kind: "validation-error", status: 422 });
  }
  return responses.sort(
    (left, right) => left.status - right.status || left.id.localeCompare(right.id),
  );
});
const collectMappingsOperation = makeGeneratorOperation("collectMappings", collectMappingsCore);
/** Traverses a request mapping into stable leaves.
 * @param value - Request mapping document.
 * @returns An Effect with ordered mapping leaves and no expected failures.
 * @example Effect.runSync(collectMappingsEffect({ kind: "input", fields: {} }));
 */
export const collectMappingsEffect = collectMappingsOperation.effect;
/** Synchronous adapter for request mapping collection.
 * @param value - Request mapping document.
 * @returns Ordered mapping leaves.
 * @throws If malformed trusted input causes a defect.
 * @example collectMappings({ kind: "input", fields: {} });
 */
export const collectMappings = collectMappingsOperation.run;
const responseContractsOperation = makeGeneratorOperation(
  "responseContracts",
  responseContractsCore,
);
/** Builds ordered response metadata, including the default validation response.
 * @param value - Response document list.
 * @returns An Effect with response contracts and no expected failures.
 * @example Effect.runSync(responseContractsEffect([]));
 */
export const responseContractsEffect = responseContractsOperation.effect;
/** Synchronous adapter for response contract collection.
 * @param value - Response document list.
 * @returns Ordered response contracts.
 * @throws If malformed trusted input causes a defect.
 * @example responseContracts([]);
 */
export const responseContracts = responseContractsOperation.run;
/** Mapping calculations shared by composed generator operations. @internal */
export const mappingCalculations = {
  collect: collectMappingsOperation.run,
  collectEffect: collectMappingsCore,
  responses: responseContractsOperation.run,
  responsesEffect: responseContractsCore,
} as const;
