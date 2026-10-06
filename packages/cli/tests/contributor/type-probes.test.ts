import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Effect, Layer } from "effect";
import { GeneratorPaths } from "create-relkit";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliProcess } from "../../src/services/process.service.js";
import { ContributorWorkspace, contributorWorkspaceLive, contributorWorkspaceLayer } from "../../src/contributor-workspace.service.js";
import { ContributorTerminal, contributorTerminalLive } from "../../src/contributor-process.service.js";
import { CliCleanup } from "../../src/services/cleanup.service.js";
declare const files: CliFileSystem;
declare const paths: GeneratorPaths;
declare const process: CliProcess;
declare const cleanup: CliCleanup;
const live = contributorWorkspaceLive("/repo");
type IsAny<T> = 0 extends (1 & T) ? true : false;
const any: IsAny<Layer.Services<typeof live>> = false;
const filesystem: Layer.Services<typeof live> = files;
const pathAuthority: Layer.Services<typeof live> = paths;
const processAuthority: Layer.Services<typeof live> = process;
// @ts-expect-error Workspace graph retains three native authorities.
const erased: Layer.Layer<ContributorWorkspace> = live;
// @ts-expect-error Terminal adapter requires an owned cleanup ledger.
const erasedTerminal: Layer.Layer<ContributorTerminal> = contributorTerminalLive;
// @ts-expect-error Service work cannot execute without its workspace owner.
Effect.runPromise(Effect.flatMap(ContributorWorkspace, service => service.roots("/repo")));
async function documentedExample() {
 return Effect.runPromise(Effect.flatMap(ContributorWorkspace, service => service.roots("/repo")).pipe(Effect.provide(contributorWorkspaceLayer("/repo"))));
}
`;

/**
 * Compiles a virtual consumer with complete dependency declaration checking.
 * @param source - Positive examples and negative authority probes.
 * @returns Strict compiler diagnostics without emitting repository files.
 */
function diagnostics(source: string) {
  const filename = fileURLToPath(new URL(".contributor-consumer.ts", import.meta.url));
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: false,
    noEmit: true,
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
  "checks examples and rejects missing workspace, process, path and cleanup authority",
  () =>
    Effect.sync(() => {
      expect(
        diagnostics(probe).map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")),
      ).toEqual([]);
    }),
);

it.effect("detects a deliberately erased workspace infrastructure environment", () =>
  Effect.sync(() => {
    const results = diagnostics(
      probe.replace(
        'const live = contributorWorkspaceLive("/repo");',
        "declare const live: Layer.Layer<ContributorWorkspace>;",
      ),
    );
    expect(results.some((item) => item.code === 2322)).toBe(true);
    expect(results.some((item) => item.code === 2578)).toBe(true);
  }),
);
