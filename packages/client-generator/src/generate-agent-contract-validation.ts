import type { AgentClientContractMetadata } from "./generate-agent-contract-validation.types.js";
import { Effect, Schema } from "effect";
import { recordCalculation } from "./generate-schema-render.js";
/** Invalid serialized agent client metadata at a named document path.
 * @example new InvalidClientContract({ path: "agents[0].clientContract.tools" });
 */
export class InvalidClientContract extends Schema.TaggedError<InvalidClientContract>()(
  "ClientGenerator.InvalidClientContract",
  { path: Schema.String },
) {}
/** Requires an object in untrusted agent metadata.
 * @param value - Candidate object.
 * @param path - Location used in a typed failure.
 * @returns An Effect yielding the object or InvalidClientContract.
 * @example Effect.runSync(contractRecordEffect({}, "agents[0]"));
 */
const contractRecordEffect = Effect.fnUntraced(function* (value: unknown, path: string) {
  const record = yield* recordCalculation(value);
  if (record === undefined) return yield* Effect.fail(new InvalidClientContract({ path }));
  return record;
});
/** Requires a declared array in untrusted agent metadata.
 * @param value - Candidate array.
 * @param path - Location used in a typed failure.
 * @returns An Effect yielding the array or InvalidClientContract.
 * @example Effect.runSync(contractArrayEffect([], "agents[0].clientContract.tools"));
 */
const contractArrayEffect = Effect.fnUntraced(function* (value: unknown, path: string) {
  if (!Array.isArray(value)) return yield* Effect.fail(new InvalidClientContract({ path }));
  return value as readonly unknown[];
});
/** Validates one static or dynamic scope entry.
 * @param value - Candidate scope.
 * @param path - Location used in a typed failure.
 * @returns An Effect yielding the validated scope or InvalidClientContract.
 * @example Effect.runSync(scopeMetadataEffect({ kind: "dynamic" }, "scope"));
 */
const scopeMetadataEffect = Effect.fnUntraced(function* (value: unknown, path: string) {
  const scope = yield* contractRecordEffect(value, path);
  if (
    typeof scope.kind !== "string" ||
    !["agent", "subagent", "node", "dynamic"].includes(scope.kind)
  )
    return yield* Effect.fail(new InvalidClientContract({ path: `${path}.kind` }));
  if (scope.kind !== "dynamic" && typeof scope.id !== "string")
    return yield* Effect.fail(new InvalidClientContract({ path: `${path}.id` }));
});
/** Validates serialized agent contract arrays before rendering their members.
 * @param value - Unknown clientContract value.
 * @param path - Agent contract path in the document.
 * @returns An Effect yielding typed metadata or InvalidClientContract.
 * @example Effect.runSync(agentContractMetadataEffect(undefined, "agents[0].clientContract"));
 */
export const agentContractMetadataEffect = Effect.fnUntraced(function* (
  value: unknown,
  path: string,
) {
  if (value === undefined) return undefined;
  const contract = yield* contractRecordEffect(value, path);
  const tools = yield* contractArrayEffect(contract.tools, `${path}.tools`);
  const state = yield* contractArrayEffect(contract.state, `${path}.state`);
  const events = yield* contractArrayEffect(contract.events, `${path}.events`);
  const scopes = yield* contractArrayEffect(contract.scopes, `${path}.scopes`);
  const waiting = yield* contractArrayEffect(contract.waiting, `${path}.waiting`);
  for (const [index, value] of tools.entries()) {
    const entryPath = `${path}.tools[${index}]`;
    const tool = yield* contractRecordEffect(value, entryPath);
    if (tool.kind !== undefined) {
      if (tool.kind !== "dynamic")
        return yield* Effect.fail(new InvalidClientContract({ path: `${entryPath}.kind` }));
    } else if (
      typeof tool.id !== "string" ||
      tool.input === undefined ||
      tool.output === undefined
    ) {
      return yield* Effect.fail(new InvalidClientContract({ path: entryPath }));
    }
  }
  for (const [index, value] of state.entries()) {
    const entryPath = `${path}.state[${index}]`;
    const field = yield* contractRecordEffect(value, entryPath);
    if (
      typeof field.name !== "string" ||
      field.schema === undefined ||
      (field.optional !== undefined && field.optional !== true)
    )
      return yield* Effect.fail(new InvalidClientContract({ path: entryPath }));
  }
  for (const [index, value] of events.entries()) {
    const entryPath = `${path}.events[${index}]`;
    const event = yield* contractRecordEffect(value, entryPath);
    if (event.kind !== undefined) {
      if (event.kind !== "dynamic")
        return yield* Effect.fail(new InvalidClientContract({ path: `${entryPath}.kind` }));
    } else if (typeof event.name !== "string" || event.schema === undefined) {
      return yield* Effect.fail(new InvalidClientContract({ path: entryPath }));
    }
  }
  for (const [index, value] of scopes.entries())
    yield* scopeMetadataEffect(value, `${path}.scopes[${index}]`);
  for (const [index, value] of waiting.entries()) {
    const entryPath = `${path}.waiting[${index}]`;
    const entry = yield* contractRecordEffect(value, entryPath);
    yield* scopeMetadataEffect(entry.scope, `${entryPath}.scope`);
    if (entry.response === undefined)
      return yield* Effect.fail(new InvalidClientContract({ path: `${entryPath}.response` }));
  }
  return contract as unknown as AgentClientContractMetadata;
});
