import { describe, expect, test } from "vitest";
import { z } from "@relkit/schema";
import { defineError } from "../src/define-error.js";
import { defineFunction } from "../src/define-function.js";
import { createFunctionDescriptor } from "../src/function-descriptor-factory.js";
import { copyDependencies } from "../src/define-function-validation.js";
import { streamOf } from "../src/stream.js";

const input = z.object({ id: z.string() });
const output = z.object({ id: z.string() });
const handler = ({ id }: { id: string }) => ({ id });

describe("callable function views", () => {
  test("derives a tool from declared metadata and accepts a per-view override", async () => {
    const fn = defineFunction({
      id: "orders.lookup",
      input,
      output,
      handler,
      tool: { description: "Lookup order", sideEffect: "read", approval: "never" },
    });
    const tool = fn.asTool();
    expect(tool.id).toBe("orders.lookup.tool");
    expect(tool.target.ref).toEqual({ kind: "function", id: "orders.lookup" });
    await expect(tool.invoke({ id: "one" })).resolves.toEqual({ id: "one" });
    const override = fn.asTool({
      id: "orders.find-tool",
      description: "Find order",
      sideEffect: "read",
      approval: "never",
    });
    expect(override.id).toBe("orders.find-tool");
    expect(override.description).toBe("Find order");
  });

  test("requires metadata and rejects stream output views", () => {
    const plain = defineFunction({ id: "orders.plain", input, output, handler });
    expect(() => plain.asTool()).toThrow("must declare complete tool metadata");
    const streamed = defineFunction({
      id: "orders.stream",
      input,
      output: streamOf(z.string()),
      handler: async function* () {
        yield "one";
      },
    });
    expect(() => (streamed.asTool as never as () => unknown)()).toThrow(
      "Stream-output functions cannot be converted to tools",
    );
  });

  test("copies declared errors and rejects undeclared error objects", () => {
    const NotFound = defineError({
      id: "orders.not-found",
      data: input,
      message: "Missing order",
    });
    const descriptor = createFunctionDescriptor({
      id: "orders.lookup",
      input,
      output,
      handler,
      invocationMode: "callable",
      errors: [NotFound],
    }) as { readonly errors: readonly unknown[] };
    expect(descriptor.errors).toEqual([NotFound]);
    expect(Object.isFrozen(descriptor.errors)).toBe(true);
    expect(() =>
      createFunctionDescriptor({
        id: "orders.lookup",
        input,
        output,
        handler,
        invocationMode: "callable",
        errors: [{} as never],
      }),
    ).toThrow("Function errors must be declared errors");
  });

  test("freezes accepted dependency maps without changing targets", () => {
    const uploads = Object.freeze({ ref: { kind: "bucket" as const, id: "uploads" } });
    const dependencies = copyDependencies({ buckets: { uploads } });
    expect(dependencies?.buckets?.uploads).toBe(uploads);
    expect(Object.isFrozen(dependencies?.buckets)).toBe(true);
  });
});
