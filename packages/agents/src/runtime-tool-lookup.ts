import type { ToolDescriptor, ToolSource } from "@relkit/tools";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";

/** Produces a bounded model-facing name for one tool ID.
 * @param id - RELKIT tool ID.
 * @param index - Tool position.
 * @returns An Effect with a stable native name.
 * @example Effect.runSync(modelToolNameEffect("math.add", 0));
 */
export const modelToolNameEffect = Effect.fn("Agents.runtime.modelToolName")(
  (id: string, index: number) =>
    Effect.sync(() => {
      const suffix = `_${index}`;
      return `${id.replaceAll(".", "_").slice(0, 64 - suffix.length)}${suffix}`;
    }),
  (effect) => observeAgent("runtime.model-tool-name", effect),
);

/** Produces a native tool name for existing synchronous callers.
 * @param id - RELKIT tool ID.
 * @param index - Tool position.
 * @returns Stable native tool name.
 * @example modelToolName("math.add", 0);
 */
export function modelToolName(id: string, index: number): string {
  return Effect.runSync(modelToolNameEffect(id, index));
}

/** Finds a native tool by direct or model-facing name.
 * @param source - Registered tool source.
 * @param refs - Declared agent tool references.
 * @param name - Native tool name.
 * @returns An Effect with a tool descriptor or undefined.
 * @example Effect.runSync(findModelToolEffect(tools, refs, "math_add_0"));
 */
export const findModelToolEffect = Effect.fn("Agents.runtime.findModelTool")(
  (source: ToolSource, refs: readonly { readonly ref: { readonly id: string } }[], name: string) =>
    Effect.sync(() => {
      const direct = findToolCore(source, name);
      if (direct !== undefined) return direct;
      const ref = refs.find((entry, index) => modelToolName(entry.ref.id, index) === name);
      return ref === undefined ? undefined : findToolCore(source, ref.ref.id);
    }),
  (effect) => observeAgent("runtime.find-model-tool", effect),
);

/** Finds a native tool for existing synchronous callers.
 * @param source - Registered tool source.
 * @param refs - Declared agent tool references.
 * @param name - Native tool name.
 * @returns A tool descriptor or undefined.
 * @example findModelTool(tools, refs, "math_add_0");
 */
export function findModelTool(
  source: ToolSource,
  refs: readonly { readonly ref: { readonly id: string } }[],
  name: string,
): ToolDescriptor<string> | undefined {
  return Effect.runSync(findModelToolEffect(source, refs, name));
}

/** Finds a registered tool by map key or descriptor ID.
 * @param source - Registered tool source.
 * @param id - RELKIT tool ID.
 * @returns An Effect with a descriptor or undefined.
 * @example Effect.runSync(findToolEffect(tools, "math.add"));
 */
export const findToolEffect = Effect.fn("Agents.runtime.findTool")(
  (source: ToolSource, id: string) => Effect.sync(() => findToolCore(source, id)),
  (effect) => observeAgent("runtime.find-tool", effect),
);

/** Finds a tool for existing synchronous callers.
 * @param source - Registered tool source.
 * @param id - RELKIT tool ID.
 * @returns A tool descriptor or undefined.
 * @example findTool(tools, "math.add");
 */
export function findTool(source: ToolSource, id: string): ToolDescriptor<string> | undefined {
  return Effect.runSync(findToolEffect(source, id));
}

function findToolCore(source: ToolSource, id: string): ToolDescriptor<string> | undefined {
  if (Array.isArray(source)) return source.find((tool) => tool.id === id);
  if (source instanceof Map)
    return source.get(id) ?? [...source.values()].find((tool) => tool.id === id);
  const record = source as Readonly<Record<string, ToolDescriptor<string>>>;
  return record[id] ?? Object.values(record).find((tool) => tool.id === id);
}
