import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Effect, Layer } from "effect";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { CliProcess } from "../../src/services/process.service.js";
import { CliGraphFiles, graphFilesLive, graphFilesLayer } from "../../src/commands/graph-file.service.js";
import { CliEnvironmentProject, environmentProjectLive, environmentProjectLayer } from "../../src/commands/env-project.service.js";
import { CliPortProbe, portProbeLive, portProbeLayer } from "../../src/commands/port-availability.service.js";
declare const filesystem: CliFileSystem;
declare const modules: CliModules;
declare const process: CliProcess;
const live = graphFilesLive;
type IsAny<T> = 0 extends (1 & T) ? true : false;
const graphAny: IsAny<Layer.Services<typeof live>> = false;
const envAny: IsAny<Layer.Services<typeof environmentProjectLive>> = false;
const portAny: IsAny<Layer.Services<typeof portProbeLive>> = false;
const graphAuthority: Layer.Services<typeof live> = filesystem;
const envFileAuthority: Layer.Services<typeof environmentProjectLive> = filesystem;
const envModuleAuthority: Layer.Services<typeof environmentProjectLive> = modules;
const portAuthority: Layer.Services<typeof portProbeLive> = process;
// @ts-expect-error Graph files cannot acquire without filesystem authority.
const missingGraphAuthority: Layer.Layer<CliGraphFiles> = live;
// @ts-expect-error Environment imports cannot acquire without filesystem and module authority.
const missingEnvAuthority: Layer.Layer<CliEnvironmentProject> = environmentProjectLive;
// @ts-expect-error Port owner lookup cannot acquire without subprocess authority.
const missingPortAuthority: Layer.Layer<CliPortProbe> = portProbeLive;
// @ts-expect-error Standalone graph use still requires its domain service.
Effect.runPromise(CliGraphFiles.use((graphs) => graphs.check({})));
// @ts-expect-error Standalone environment use still requires its domain service.
Effect.runPromise(CliEnvironmentProject.use((project) => project.load({})));
// @ts-expect-error Standalone port use still requires its domain service.
Effect.runPromise(CliPortProbe.use((probe) => probe.check(0, "127.0.0.1", "--port")));
async function documentedExamples() {
  const result = await Effect.runPromise(CliGraphFiles.use((graphs) => graphs.check({})).pipe(Effect.provide(graphFilesLayer)));
  const definition = await Effect.runPromise(CliEnvironmentProject.use((project) => project.load({})).pipe(Effect.provide(environmentProjectLayer)));
  await Effect.runPromise(CliPortProbe.use((probe) => probe.check(0, "127.0.0.1", "--port")).pipe(Effect.provide(portProbeLayer)));
  return { result, definition };
}
`;

/**
 * Compiles a virtual strict consumer against the actual service declarations.
 * @param source - Positive examples and negative authority expectations.
 * @returns Diagnostics without writing generated probe source to the repository.
 */
function diagnostics(source: string): readonly ts.Diagnostic[] {
  const filename = fileURLToPath(new URL(".read-service-consumer.ts", import.meta.url));
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
  host.getSourceFile = (name, languageVersion, onError, fresh) =>
    name === filename
      ? ts.createSourceFile(name, source, languageVersion, true)
      : original(name, languageVersion, onError, fresh);
  return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
}

it.effect("checks all documented examples and rejects missing service authority", () =>
  Effect.sync(() => {
    expect(
      diagnostics(probe).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")),
    ).toEqual([]);
  }),
);

it.effect("detects an erased live-layer filesystem requirement", () =>
  Effect.sync(() => {
    const result = diagnostics(
      probe.replace(
        "const live = graphFilesLive;",
        "declare const live: Layer.Layer<CliGraphFiles>;",
      ),
    );
    expect(result.some((item) => item.code === 2322)).toBe(true);
    expect(result.some((item) => item.code === 2578)).toBe(true);
  }),
);
