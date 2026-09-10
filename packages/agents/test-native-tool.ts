import { tool } from "langchain";
import { z } from "@relkit/schema";

export function createNativeStringTool(
  name: string,
  handler: (input: { readonly value: string }) => string | Promise<string>,
) {
  return tool(handler, {
    name,
    description: `${name} a value.`,
    schema: z.object({ value: z.string() }),
  });
}
