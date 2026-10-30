/**
 * Emits the statically declared request-lifecycle edges (`calls-function`,
 * `uses-table`, `triggers-channel`) from source usage collected during boundary
 * validation. Identities resolve against normalized descriptors only; nothing
 * here evaluates application code.
 */
import { accessFor } from "./normalize-source-usage.js";
import { serviceEntries } from "./normalize-graph-services.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";
import type { NormalizationWork, SourceUsage } from "./normalize-types.js";

/** Graph edge accumulator shared with the owning edge builder. */
type AddEdge = (
  kind: string,
  from: string,
  to: string,
  metadata?: string | Record<string, unknown>,
) => void;

/**
 * Emits statically declared request-lifecycle edges from collected source usage.
 * @param add - Graph edge accumulator owned by this operation.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param database - The Drizzle database service node, when the application declares one.
 * @returns Nothing; updates only the supplied accumulator.
 * @remarks Usage inside same-service helper modules (any same-service import that owns no
 * descriptor) is attributed transitively to every function importing the helper. This is a
 * deliberate over-approximation: a function importing a helper may never reach the branch
 * that triggers a channel, but the graph still records the possible relationship.
 */
export function addSourceUsageEdges(
  add: AddEdge,
  work: NormalizationWork,
  database: { readonly id: string; readonly capability?: unknown } | undefined,
): void {
  if (work.sourceUsage.size === 0) return;
  const functionsByFile = new Map<string, string>();
  const serviceMembersByFile = new Map<string, Map<string, string>>();
  const channelsByFile = new Map<string, string>();
  const descriptorFiles = new Set<string>();
  for (const descriptor of work.descriptors) {
    const file = descriptor.source.file;
    descriptorFiles.add(file);
    if (descriptor.kind === "function") {
      if (!functionsByFile.has(file) || descriptor.exportKind === "default")
        functionsByFile.set(file, descriptor.id);
    } else if (descriptor.kind === "channel") {
      channelsByFile.set(file, descriptor.id);
    } else if (descriptor.kind === "service") {
      const members = serviceMembersByFile.get(file) ?? new Map<string, string>();
      const value = isRecord(descriptor.value) ? descriptor.value : {};
      for (const [member, target] of serviceEntries(value, descriptor)) {
        const targetId = refId(target);
        if (targetId !== undefined && refKind(target) === "function") members.set(member, targetId);
      }
      serviceMembersByFile.set(file, members);
    }
  }
  const tables = new Set<string>(
    database !== undefined &&
      isRecord(database.capability) &&
      Array.isArray(database.capability.tables)
      ? database.capability.tables.flatMap((table) =>
          isRecord(table) && typeof table.name === "string" ? [table.name] : [],
        )
      : [],
  );
  for (const file of [...work.sourceUsage.keys()].sort()) {
    const functionId = functionsByFile.get(file);
    if (functionId === undefined) continue;
    for (const usage of mergedUsage(work.sourceUsage, file, descriptorFiles)) {
      for (const call of usage.calls) {
        const target =
          call.member === undefined
            ? functionsByFile.get(call.file)
            : serviceMembersByFile.get(call.file)?.get(call.member);
        if (target !== undefined && target !== functionId)
          add("calls-function", functionId, target);
      }
      if (database !== undefined) {
        for (const table of usage.tables) {
          const access = accessFor(table.method);
          if (access !== undefined && tables.has(table.property))
            add("uses-table", functionId, database.id, { table: table.property, access });
        }
      }
      for (const channel of usage.channels) {
        const channelId = channelsByFile.get(channel.file);
        if (channelId !== undefined) add("triggers-channel", functionId, channelId);
      }
    }
  }
}

/**
 * Lists a file's usage followed by every transitively imported same-service helper's usage.
 * @param index - Collected usage keyed by project-relative file.
 * @param file - Function module whose helpers are followed.
 * @param descriptorFiles - Files owning descriptors; these are never treated as helpers.
 * @returns Usage records in deterministic visit order without repeats.
 */
function mergedUsage(
  index: ReadonlyMap<string, SourceUsage>,
  file: string,
  descriptorFiles: ReadonlySet<string>,
): readonly SourceUsage[] {
  const visited = new Set<string>([file]);
  const queue = [file];
  const result: SourceUsage[] = [];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const usage = index.get(next);
    if (usage === undefined) continue;
    result.push(usage);
    for (const helper of usage.helpers) {
      if (visited.has(helper.file) || descriptorFiles.has(helper.file)) continue;
      visited.add(helper.file);
      queue.push(helper.file);
    }
  }
  return result;
}
