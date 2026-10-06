import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Effect, Layer, Scope } from "effect";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { CliProcess } from "../../src/services/process.service.js";
import { CliCleanup } from "../../src/services/cleanup.service.js";
import { CliDoctor, doctorLive, doctorLiveLayer, doctorProjectEffect } from "../../src/commands/doctor-project.service.js";
import { CliDoctorToolchain } from "../../src/commands/doctor-toolchain.service.js";
import { CliStart, startLive, startLiveLayer } from "../../src/commands/start.service.js";
import { CliBuiltProject } from "../../src/commands/start-built.js";
import { CliStartNative } from "../../src/commands/start-native.service.js";
import { CliStartProcess, startProcessLive } from "../../src/commands/start-process.service.js";
import { startProjectEffect, startProject, runStartEffect } from "../../src/commands/start.js";
import { GeneratorFileSystem } from "create-relkit";
declare const filesystem: CliFileSystem;
declare const modules: CliModules;
declare const processes: CliProcess;
declare const cleanup: CliCleanup;
declare const generatorFiles: GeneratorFileSystem;
declare const toolchain: CliDoctorToolchain;
declare const built: CliBuiltProject;
declare const native: CliStartNative;
declare const child: CliStartProcess;
const live = startLive;
type IsAny<T> = 0 extends (1 & T) ? true : false;
const startAny: IsAny<Layer.Services<typeof live>> = false;
const doctorAny: IsAny<Layer.Services<typeof doctorLive>> = false;
const builtAuthority: Layer.Services<typeof live> = built;
const nativeAuthority: Layer.Services<typeof live> = native;
const childAuthority: Layer.Services<typeof live> = child;
const doctorFiles: Layer.Services<typeof doctorLive> = filesystem;
const doctorModules: Layer.Services<typeof doctorLive> = modules;
const doctorProcess: Layer.Services<typeof doctorLive> = processes;
const doctorCleanup: Layer.Services<typeof doctorLive> = cleanup;
const doctorGenerator: Layer.Services<typeof doctorLive> = generatorFiles;
const doctorToolchain: Layer.Services<typeof doctorLive> = toolchain;
// @ts-expect-error Live start cannot erase native authorities.
const missingStart: Layer.Layer<CliStart> = live;
// @ts-expect-error Live doctor cannot erase native authorities.
const missingDoctor: Layer.Layer<CliDoctor> = doctorLive;
// @ts-expect-error Production acquisition requires a caller lifetime even with its native Layer.
Effect.runPromise(startProjectEffect().pipe(Effect.provide(startLiveLayer())));
// @ts-expect-error Domain start requires both its service and a lifetime.
Effect.runPromise(startProjectEffect());
// @ts-expect-error Doctor retains its service requirement until supplied.
Effect.runPromise(doctorProjectEffect());
// @ts-expect-error Process Layer retains explicit cleanup authority.
const missingCleanup: Layer.Layer<CliStartProcess> = startProcessLive();
async function documentedExamples() {
  const report = await Effect.runPromise(doctorProjectEffect().pipe(Effect.provide(doctorLiveLayer())));
  await Effect.runPromise(runStartEffect({ port: 0 }).pipe(Effect.provide(startLiveLayer())));
  await Effect.runPromise(Effect.scoped(startProjectEffect()).pipe(Effect.provide(startLiveLayer())));
  const project = await startProject({ port: 0 });
  try { await fetch(\`http://127.0.0.1:\${project.port}/_relkit/v1/health/live\`); }
  finally { await project.stop(); }
  return report;
}
`;

/**
 * Checks public service authority and documentation without generating repository files.
 * @param source - Virtual consumer with positive examples and negative expectations.
 * @returns Strict dependency and consumer diagnostics.
 */
function diagnostics(source: string): readonly ts.Diagnostic[] {
  const filename = fileURLToPath(new URL(".start-doctor-consumer.ts", import.meta.url));
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

it.effect("checks documented examples and rejects missing domain, native and Scope authority", () =>
  Effect.sync(() => {
    expect(
      diagnostics(probe).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")),
    ).toEqual([]);
  }),
);

it.effect("detects a mutated start Layer that erases infrastructure requirements", () =>
  Effect.sync(() => {
    const result = diagnostics(
      probe.replace("const live = startLive;", "declare const live: Layer.Layer<CliStart>;"),
    );
    expect(result.some((item) => item.code === 2322)).toBe(true);
    expect(result.some((item) => item.code === 2578)).toBe(true);
  }),
);
