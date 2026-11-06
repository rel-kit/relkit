import { expect, test } from "bun:test";
import { resolve } from "node:path";
import ts from "relkit-typescript";
import { eventSourceDiagnostics } from "../../packages/cli/src/compiler/event-source-diagnostics.ts";

test("reports source-located event function option, result, capability, and target errors", () => {
  const root = resolve(import.meta.dir, "../..");
  const file = resolve(import.meta.dir, "event-source-fixture.ts");
  const source = `
    import { defineEventFunction as reaction } from "relkit/events";
    import { defineError } from "relkit/functions";
    import { Effect } from "../../packages/relkit/node_modules/effect/dist/index.js";
    import { defineTool } from "relkit/tools";
    import { z } from "relkit/schema";
    const consumer = reaction({ id: "consumer", event: "created" as never, handler: () => {} });
    consumer.invoke({});
    (consumer as any).asTool();
    reaction({ id: "bad_result", event: "created" as never, handler: async () => 123 });
    reaction({ id: "bad_options", event: "created", input: z.unknown(), output: z.void(), tool: {}, trigger: {}, handler: () => {} } as any);
    const failed = defineError({ id: "failed", data: z.unknown(), message: "failed" });
    reaction({ id: "effect_void", event: "created" as never, handler: () => Effect.void });
    reaction({ id: "effect_error", event: "created" as never, errors: [failed], handler: () => Effect.fail(failed.create(null)) });
    reaction({ id: "declared_error", event: "created" as never, errors: [failed], handler: () => failed.create(null) });
    reaction({ id: "bad_effect", event: "created" as never, handler: () => Effect.succeed(1) });
    defineTool({ id: "invalid_tool", target: consumer } as any);
  `;
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const readSource = host.getSourceFile;
  host.getSourceFile = (name, ...args) =>
    name === file
      ? ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true)
      : readSource(name, ...args);
  const program = ts.createProgram([file], options, host);
  const diagnostics = eventSourceDiagnostics(program, root).filter((item) =>
    item.file?.endsWith("event-source-fixture.ts"),
  );
  expect(diagnostics.map((item) => item.code)).toEqual([
    "RELKIT_EVENT_FUNCTION_TARGET_INVALID",
    "RELKIT_EVENT_FUNCTION_TARGET_INVALID",
    "RELKIT_EVENT_FUNCTION_RESULT_INVALID",
    ...Array(4).fill("RELKIT_EVENT_FUNCTION_OPTION_INVALID"),
    "RELKIT_EVENT_FUNCTION_RESULT_INVALID",
    "RELKIT_EVENT_FUNCTION_TARGET_INVALID",
  ]);
  for (const diagnostic of diagnostics) {
    expect(diagnostic.line).toBeGreaterThan(1);
    expect(diagnostic.column).toBeGreaterThan(0);
    expect(diagnostic.suggestion).toBeTruthy();
  }
  expect(diagnostics[0]?.message).toContain("consumer");
  expect(diagnostics.at(-1)?.message).toContain("invalid_tool");
});
