import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Effect, Layer } from "effect";
import { CliFileSystem, fileSystemLayer } from "../../src/services/filesystem.service.js";
import { CliCompiler } from "../../src/services/compiler.service.js";
import { CliModules } from "../../src/services/modules.service.js";
import { CliProcess, processLayer } from "../../src/services/process.service.js";
import { CliCleanup } from "../../src/services/cleanup.service.js";
import { CliProject, projectLayer, projectLiveLayer } from "../../src/services/project.service.js";
import { CliClient, CliClientSettings, clientLayer, clientLiveLayer } from "../../src/services/client.service.js";
import { CliHttp } from "../../src/services/http.service.js";
import { CliDeployment, deploymentLayer, deploymentLiveLayer } from "../../src/services/deployment.service.js";
import { CliPulumi } from "../../src/services/pulumi.service.js";
import { CliLocal, localLayer, localLiveLayer } from "../../src/services/local.service.js";
import { CliDev, devLayer, devLiveLayer } from "../../src/services/dev.service.js";
import { CliDevSupervisor } from "../../src/services/dev-supervisor.service.js";
import { CliSourceWatch, sourceWatchLayer } from "../../src/services/source-watch.service.js";
import { CliPortProbe } from "../../src/commands/port-availability.service.js";
import { CliTelemetryNative } from "../../src/commands/dev-telemetry-native.service.js";
import type { CliCommandContext } from "../../src/main-support-types.js";
declare const files: CliFileSystem;
declare const compiler: CliCompiler;
declare const modules: CliModules;
declare const processes: CliProcess;
declare const cleanup: CliCleanup;
declare const project: CliProject;
declare const http: CliHttp;
declare const settings: CliClientSettings;
declare const pulumi: CliPulumi;
declare const supervisor: CliDevSupervisor;
declare const sourceWatch: CliSourceWatch;
declare const ports: CliPortProbe;
declare const telemetry: CliTelemetryNative;
declare const context: CliCommandContext;
const live = projectLayer;
type IsAny<T> = 0 extends (1 & T) ? true : false;
const projectAny: IsAny<Layer.Services<typeof live>> = false;
const clientAny: IsAny<Layer.Services<typeof clientLayer>> = false;
const localAny: IsAny<Layer.Services<ReturnType<typeof localLayer>>> = false;
const deployAny: IsAny<Layer.Services<ReturnType<typeof deploymentLayer>>> = false;
const devAny: IsAny<Layer.Services<typeof devLayer>> = false;
const projectFiles: Layer.Services<typeof live> = files;
const projectCompiler: Layer.Services<typeof live> = compiler;
const projectModules: Layer.Services<typeof live> = modules;
const projectProcesses: Layer.Services<typeof live> = processes;
const projectCleanup: Layer.Services<typeof live> = cleanup;
const clientHttp: Layer.Services<typeof clientLayer> = http;
const clientSettings: Layer.Services<typeof clientLayer> = settings;
const localProject: Layer.Services<ReturnType<typeof localLayer>> = project;
const deployPulumi: Layer.Services<ReturnType<typeof deploymentLayer>> = pulumi;
const devSupervisor: Layer.Services<typeof devLayer> = supervisor;
const devWatch: Layer.Services<typeof devLayer> = sourceWatch;
const devPorts: Layer.Services<typeof devLayer> = ports;
const devTelemetry: Layer.Services<typeof devLayer> = telemetry;
// @ts-expect-error Project acquisition cannot erase filesystem/compiler/process/cleanup authority.
const missingProjectAuthority: Layer.Layer<CliProject> = live;
// @ts-expect-error Client acquisition cannot erase HTTP, filesystem, compiler or token authority.
const missingClientAuthority: Layer.Layer<CliClient> = clientLayer;
// @ts-expect-error Local acquisition cannot erase native project/runtime authority.
const missingLocalAuthority: Layer.Layer<CliLocal> = localLayer();
// @ts-expect-error Deployment acquisition cannot erase SDK/consent/project authority.
const missingDeploymentAuthority: Layer.Layer<CliDeployment> = deploymentLayer();
// @ts-expect-error Dev acquisition cannot erase native project/compiler/telemetry authority.
const missingDevAuthority: Layer.Layer<CliDev> = devLayer;
// @ts-expect-error A project method still requires its domain service until provided.
Effect.runPromise(CliProject.use((service) => service.check()));
// @ts-expect-error Initial development compilation also requires explicit project authority.
Effect.runPromise(CliProject.use((service) => service.checkDevelopment({ projectRoot: "/project", generationId: "initial" })));
// @ts-expect-error A dev session retains its lifetime even after its service Layer is supplied.
Effect.runPromise(CliDev.use((service) => service.run([], context)).pipe(Effect.provide(devLiveLayer())));
async function documentedExamples() {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const watches = yield* CliSourceWatch;
    yield* Effect.acquireRelease(watches.watch("./src", true, () => undefined, () => undefined), (stop) => Effect.sync(stop));
  })).pipe(Effect.provide(sourceWatchLayer)));
  await Effect.runPromise(CliFileSystem.use((service) => service.exists("./package.json")).pipe(Effect.provide(fileSystemLayer)));
  await Effect.runPromise(CliProcess.use((service) => service.run({ command: process.execPath, args: ["--version"], cwd: process.cwd() })).pipe(Effect.provide(processLayer)));
  await Effect.runPromise(CliProject.use((service) => service.check()).pipe(Effect.provide(projectLiveLayer)));
  await Effect.runPromise(CliProject.use((service) => service.checkDevelopment({ projectRoot: "/project", generationId: "initial" })).pipe(Effect.provide(projectLiveLayer)));
  await Effect.runPromise(CliClient.use((service) => service.check("http://localhost:3000/", "./generated")).pipe(Effect.provide(clientLiveLayer)));
  await Effect.runPromise(CliLocal.use((service) => service.run({ command: "status", projectRoot: process.cwd(), detach: false, yes: false, dryRun: false }, context)).pipe(Effect.provide(localLiveLayer())));
  await Effect.runPromise(CliDeployment.use((service) => service.run(process.cwd(), { command: "preview", stack: "development", backend: { kind: "local" }, config: {}, nonInteractive: true }, context)).pipe(Effect.provide(deploymentLiveLayer())));
  await Effect.runPromise(Effect.scoped(CliDev.use((service) => service.run([], context))).pipe(Effect.provide(devLiveLayer())));
}
`;

/**
 * Compiles complete strict consumers without writing a generated source file.
 * @param source - Actual service examples plus expected missing-authority failures.
 * @returns Full dependency and consumer diagnostics with library checking enabled.
 */
function diagnostics(source: string): readonly ts.Diagnostic[] {
  const filename = fileURLToPath(new URL(".native-service-consumer.ts", import.meta.url));
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

it.effect(
  "checks documented service composition and rejects missing domain/native/Scope authority",
  () =>
    Effect.sync(() => {
      expect(
        diagnostics(probe).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")),
      ).toEqual([]);
    }),
  30_000,
);

it.effect(
  "detects a project Layer mutation that erases filesystem/compiler requirements",
  () =>
    Effect.sync(() => {
      const result = diagnostics(
        probe.replace("const live = projectLayer;", "declare const live: Layer.Layer<CliProject>;"),
      );
      expect(result.some((item) => item.code === 2322)).toBe(true);
      expect(result.some((item) => item.code === 2578)).toBe(true);
    }),
  30_000,
);
