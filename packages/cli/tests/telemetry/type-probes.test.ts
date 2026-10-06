import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Effect, Layer, Scope } from "effect";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliTelemetryNative, telemetryNativeLayer } from "../../src/commands/dev-telemetry-native.service.js";
import { makeDevTelemetryEffect } from "../../src/commands/dev-telemetry.js";
const operation = makeDevTelemetryEffect("/fixture");
type IsAny<T> = 0 extends (1 & T) ? true : false;
const servicesAny: IsAny<Effect.Services<typeof operation>> = false;
declare const native: CliTelemetryNative;
declare const cleanup: CliCleanup;
declare const scope: Scope.Scope;
const nativeAuthority: Effect.Services<typeof operation> = native;
const cleanupAuthority: Effect.Services<typeof operation> = cleanup;
const scopeAuthority: Effect.Services<typeof operation> = scope;
// @ts-expect-error Acquisition cannot run without service authority and caller scope.
Effect.runPromise(operation);
// @ts-expect-error Providing native services alone does not remove lifetime ownership.
Effect.runPromise(operation.pipe(Effect.provide(Layer.merge(telemetryNativeLayer, cleanupLayer))));
async function completeConsumer() {
  await Effect.runPromise(Effect.scoped(operation).pipe(Effect.provide(Layer.merge(telemetryNativeLayer, cleanupLayer))));
}
`;

/**
 * Compiles concrete native consumers and deliberate missing-owner failures.
 * @param source - Virtual strict consumer checked against current implementation.
 * @returns Diagnostics without adding generated source to the repository.
 */
function diagnostics(source: string): readonly ts.Diagnostic[] {
  const filename = fileURLToPath(new URL(".telemetry-consumer.ts", import.meta.url));
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

it.effect(
  "requires telemetry, cleanup and Scope authority and compiles complete consumers",
  () =>
    Effect.sync(() => {
      expect(
        diagnostics(probe).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")),
      ).toEqual([]);
    }),
  20_000,
);

it.effect(
  "detects mutation that erases the resource owner's required services",
  () =>
    Effect.sync(() => {
      const result = diagnostics(
        probe.replace(
          'const operation = makeDevTelemetryEffect("/fixture");',
          "declare const operation: Effect.Effect<unknown>;",
        ),
      );
      expect(result.some((item) => item.code === 2322)).toBe(true);
      expect(result.some((item) => item.code === 2578)).toBe(true);
    }),
  20_000,
);
