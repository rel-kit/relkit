import { add } from "./normalize-pass-utils.js";
import { isRecord, refId } from "./normalize-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";

export function detectCycles(work: NormalizationWork): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  const walk = (id: string, path: readonly string[]): void => {
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      const cycle = [...path.slice(start < 0 ? 0 : start), id].join(" -> ");
      if (reported.has(cycle)) return;
      reported.add(cycle);
      const descriptor = work.referencesByKind.get("function")?.get(id) ?? work.descriptors[0];
      if (descriptor)
        add(work, descriptor, NORMALIZE_CODES.cycle, `Prohibited direct-call cycle: ${cycle}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const value = work.referencesByKind.get("function")?.get(id)?.value;
    const refs =
      isRecord(value) && isRecord(value.dependencies) && isRecord(value.dependencies.functions)
        ? Object.values(value.dependencies.functions).sort((left, right) =>
            String(refId(left) ?? "").localeCompare(String(refId(right) ?? "")),
          )
        : [];
    for (const reference of refs) {
      const target = refId(reference);
      if (target) walk(target, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of [...(work.referencesByKind.get("function")?.keys() ?? [])].sort()) walk(id, []);
}
