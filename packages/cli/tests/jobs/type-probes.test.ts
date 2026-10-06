import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Effect, Layer } from "effect";
import { CliJobs, jobsLayer, jobsLiveLayer } from "../../src/services/jobs.service.js";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliHttp } from "../../src/services/http.service.js";
import { CliJobsSdk, jobsSdkLayer, jobsSdkLiveLayer } from "../../src/services/jobs-sdk.service.js";
import { CliCleanup } from "../../src/services/cleanup.service.js";
declare const filesystem: CliFileSystem;
declare const http: CliHttp;
declare const sdk: CliJobsSdk;
declare const cleanup: CliCleanup;
const live = jobsLayer;
type IsAny<T> = 0 extends (1 & T) ? true : false;
const jobsAny: IsAny<Layer.Services<typeof live>> = false;
const fileAuthority: Layer.Services<typeof live> = filesystem;
const httpAuthority: Layer.Services<typeof live> = http;
const sdkAuthority: Layer.Services<typeof live> = sdk;
const cleanupAuthority: Layer.Services<typeof jobsSdkLayer> = cleanup;
// @ts-expect-error Jobs cannot acquire without three explicit adapters.
const missingAdapters: Layer.Layer<CliJobs> = live;
// @ts-expect-error Native SDK requires invocation-owned cleanup authority.
const missingCleanup: Layer.Layer<CliJobsSdk> = jobsSdkLayer;
// @ts-expect-error Standalone jobs use requires its domain service.
Effect.runPromise(CliJobs.use((jobs) => jobs.manifest("/fixture")));
// @ts-expect-error Watch iterator requires its explicit lifetime scope.
Effect.runPromise(CliJobsSdk.use((sdk) => sdk.watch("http://127.0.0.1", {}, "example", {}, new AbortController().signal)).pipe(Effect.provide(jobsSdkLiveLayer)));
async function documentedExample() {
  return Effect.runPromise(CliJobs.use((jobs) => jobs.manifest(process.cwd())).pipe(Effect.provide(jobsLiveLayer())));
}
async function scopedSdkConsumer() {
  await Effect.runPromise(Effect.scoped(CliJobsSdk.use((sdk) => sdk.watch("http://127.0.0.1", {}, "example", {}, new AbortController().signal))).pipe(Effect.provide(jobsSdkLiveLayer)));
}
`;

/**
 * Compiles strict positive examples and missing-authority consumers against source.
 * @param source - Actual service consumer, including expected compile failures.
 * @returns Complete diagnostics without creating an authored probe file.
 */
function diagnostics(source: string): readonly ts.Diagnostic[] {
  const filename = fileURLToPath(new URL(".jobs-consumer.ts", import.meta.url));
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
  "retains filesystem, HTTP, SDK, cleanup, and watch lifetime requirements",
  () =>
    Effect.sync(() => {
      expect(
        diagnostics(probe).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")),
      ).toEqual([]);
    }),
  // Full declaration compilation has a compiler budget separate from runtime deadlines.
  20_000,
);

it.effect(
  "detects erased jobs-layer authority",
  () =>
    Effect.sync(() => {
      const result = diagnostics(
        probe.replace("const live = jobsLayer;", "declare const live: Layer.Layer<CliJobs>;"),
      );
      expect(result.some((item) => item.code === 2322)).toBe(true);
      expect(result.some((item) => item.code === 2578)).toBe(true);
    }),
  20_000,
);
