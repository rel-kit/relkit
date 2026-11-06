/** Verifies the opt-in rule that reports declared errors a function's handler never raises. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { Effect } from "effect";
import ts from "relkit-typescript";
import { unusedErrorDiagnosticsEffect } from "../../packages/cli/src/compiler/unused-error-diagnostics.ts";

test("reports declared errors the handler neither throws nor returns", () => {
  const root = resolve(import.meta.dir, "../..");
  const file = resolve(import.meta.dir, "unused-error-fixture.ts");
  const source = `
    import { defineError, defineFunction } from "relkit/functions";
    import { z } from "relkit/schema";
    const missing = defineError({ id: "missing", data: z.object({}), message: "missing" });
    const busy = defineError({ id: "busy", data: z.object({}), message: "busy" });
    const gone = defineError({ id: "gone", data: z.object({}), message: "gone" });
    defineFunction({
      id: "thrown",
      input: z.object({}),
      output: z.object({}),
      errors: [missing, busy],
      handler: async () => {
        if (Math.random() > 0.5) throw new missing({});
        return busy.create({});
      },
    });
    defineFunction({
      id: "unused",
      input: z.object({}),
      output: z.object({}),
      errors: [missing, gone],
      handler: async () => { throw new missing({}); },
    });
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
  const diagnostics = Effect.runSync(unusedErrorDiagnosticsEffect(program, root)).filter((item) =>
    item.file?.endsWith("unused-error-fixture.ts"),
  );
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toMatchObject({
    code: "RELKIT_FUNCTION_ERROR_UNUSED",
    severity: "warning",
    message: 'Function "unused" declares error gone, but its handler never raises it.',
  });
  expect(diagnostics[0]?.line).toBe(21);
});
