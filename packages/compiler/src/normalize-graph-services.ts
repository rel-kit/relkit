import { clean } from "./normalize-graph-utils.js";
import { isRecord, refId } from "./normalize-utils.js";

export function serviceNodeData(value: Record<string, unknown>): Record<string, unknown> {
  const functions = isRecord(value.functions) ? value.functions : {};
  const members = Object.entries(functions).flatMap(([name, target]) => {
    const functionId = refId(target);
    return functionId === undefined ? [] : [{ name, functionId }];
  });
  const middleware = Array.isArray(value.middleware)
    ? value.middleware.flatMap((entry) => {
        const id = refId(entry);
        return id === undefined ? [] : [{ id }];
      })
    : [];
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(Array.isArray(value.tags) ? { tags: clean(value.tags) } : {}),
    members,
    middleware,
  };
}
