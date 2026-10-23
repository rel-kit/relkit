/** Exercises native test native tool behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { DynamicStructuredTool } from "langchain";
import { z, type InferOutput } from "@relkit/schema";

export function createNativeStringTool(
  name: string,
  handler: (input: { readonly value: string }) => string | Promise<string>,
) {
  const schema = z.object({ value: z.string() });
  return new DynamicStructuredTool<typeof schema, InferOutput<typeof schema>>({
    name,
    description: `${name} a value.`,
    schema,
    func: async (input) => handler(input),
  });
}
