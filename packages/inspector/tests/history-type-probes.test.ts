/** Strict consumers retain explicit native and Scope authority after moving history out of the CLI. */
import { expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Effect, Scope } from "effect";
import { InspectorHistory } from "../src/history.service.js";
import { InspectorHistoryNative, InspectorHistoryNativeLive } from "../src/history-native.service.js";
const operation = InspectorHistory.make("/fixture", "project");
type IsAny<T> = 0 extends (1 & T) ? true : false;
const servicesAny: IsAny<Effect.Services<typeof operation>> = false;
declare const native: InspectorHistoryNative;
declare const scope: Scope.Scope;
const nativeAuthority: Effect.Services<typeof operation> = native;
const scopeAuthority: Effect.Services<typeof operation> = scope;
// @ts-expect-error Acquisition requires both explicit native authority and its caller Scope.
Effect.runPromise(operation);
// @ts-expect-error Supplying native authority cannot erase lifetime ownership.
Effect.runPromise(operation.pipe(Effect.provide(InspectorHistoryNativeLive)));
async function completeConsumer() {
  await Effect.runPromise(Effect.scoped(operation).pipe(Effect.provide(InspectorHistoryNativeLive)));
}
`;

/** Compiles full dependency declarations, including intentional missing-authority failures. */
function diagnostics(source: string) {
  const filename = fileURLToPath(new URL(".history-consumer.ts", import.meta.url));
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: false,
    types: ["bun"],
  };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, fresh) =>
    name === filename
      ? ts.createSourceFile(name, source, version, true)
      : original(name, version, onError, fresh);
  return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
}

test("compiles complete consumers and requires native plus Scope authority", () => {
  expect(
    diagnostics(probe).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")),
  ).toEqual([]);
}, 20_000);

test("detects an implementation mutation erasing native/lifetime requirements", () => {
  const result = diagnostics(
    probe.replace(
      'const operation = InspectorHistory.make("/fixture", "project");',
      "declare const operation: Effect.Effect<void>;",
    ),
  );
  expect(result.some((item) => item.code === 2322)).toBe(true);
  expect(result.some((item) => item.code === 2578)).toBe(true);
}, 20_000);
