import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Context, Effect, Layer } from "effect";
import { ServerRuntime, ServerRuntimeLive } from "../../src/server-runtime/server-runtime.service.js";
import { RuntimeEnvironment } from "../../src/server-runtime/runtime-environment.js";
import { createServerRuntimeHost } from "../../src/server-runtime/server-runtime-host.js";
class Credentials extends Context.Service<Credentials, { readonly token: string }>()("probe/Credentials") {}
declare const environment: RuntimeEnvironment;
const live = ServerRuntimeLive;
type IsAny<T> = 0 extends (1 & T) ? true : false;
const requirementIsAny: IsAny<Layer.Services<typeof live>> = false;
const requiredAuthority: Layer.Services<typeof live> = environment;
// @ts-expect-error The live lifecycle cannot erase its environment authority.
const missingEnvironment: Layer.Layer<ServerRuntime> = live;
// @ts-expect-error A lifecycle operation cannot run without its owning service.
Effect.runPromise(ServerRuntime);
const program = Effect.gen(function* () {
  const runtime = yield* ServerRuntime;
  // @ts-expect-error Framework callbacks cannot smuggle unprovided authority into workers.
  yield* runtime.worker("worker", Credentials.pipe(Effect.asVoid));
});
async function checkedExample() {
  const host = await createServerRuntimeHost({ report: () => {} });
  try { await host.resource("provider", async () => ({ closed: false }), (value) => { value.closed = true; }); }
  finally { await host.shutdown(async () => {}); }
}
`;

/**
 * Compiles a virtual consumer against the actual service declarations.
 * @param source - Positive and negative authority contracts.
 * @returns All strict TypeScript diagnostics, without writing probe files.
 */
function diagnostics(source: string): readonly ts.Diagnostic[] {
  const filename = fileURLToPath(new URL(".runtime-consumer.ts", import.meta.url));
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
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    name === filename
      ? ts.createSourceFile(name, source, languageVersion, true)
      : original(name, languageVersion, onError, shouldCreateNewSourceFile);
  return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
}

it.effect("requires lifecycle/environment authority and checks the documented host example", () =>
  Effect.sync(() => {
    const result = diagnostics(probe);
    expect(result.map((value) => ts.flattenDiagnosticMessageText(value.messageText, "\n"))).toEqual(
      [],
    );
  }),
);

it.effect("compiler probes fail when a live layer requirement is erased", () =>
  Effect.sync(() => {
    const result = diagnostics(
      probe.replace(
        "const live = ServerRuntimeLive;",
        "declare const live: Layer.Layer<ServerRuntime>;",
      ),
    );
    expect(result.some((value) => value.code === 2322)).toBe(true);
    expect(result.some((value) => value.code === 2578)).toBe(true);
  }),
);
