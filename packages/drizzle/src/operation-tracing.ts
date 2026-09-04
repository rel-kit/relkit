import { frameworkTrace } from "@relkit/invocation";
import type { ModelBinding } from "./runtime-types.js";

export function withOperationTracing(
  operation: (binding: ModelBinding, name: string, args: unknown) => Promise<unknown>,
) {
  return (binding: ModelBinding, name: string, args: unknown): Promise<unknown> =>
    frameworkTrace.span(
      `relkit.database.${name}`,
      { input: args, attributes: { "db.system.name": binding.dialect, "db.operation.name": name } },
      () => operation(binding, name, args),
    );
}
