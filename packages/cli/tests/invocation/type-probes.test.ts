import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const probe = `import { Effect } from "effect";
import { CliGenerator, generatorLayer } from "../../src/services/generator.service.js";
import { CliInteraction, interactionLayer } from "../../src/cli-interaction.service.js";
import type { PromptDriver } from "create-relkit";
declare const driver: PromptDriver;
// @ts-expect-error Standalone generator use requires the selected domain authority.
Effect.runPromise(CliGenerator.use((generator) => generator.previewCreate({}, {})));
// @ts-expect-error Standalone prompt use requires explicit interaction authority.
Effect.runPromise(CliInteraction.use((interaction) => interaction.confirm(driver, { message: "Continue?" })));
type IsAny<T> = 0 extends (1 & T) ? true : false;
const missingService = CliGenerator.use((generator) => generator.previewCreate({}, {}));
const environmentAny: IsAny<Effect.Services<typeof missingService>> = false;
declare const generator: CliGenerator;
const explicitAuthority: Effect.Services<typeof missingService> = generator;
async function completeConsumers() {
  await Effect.runPromise(CliGenerator.use((generator) => generator.previewCreate({}, {})).pipe(Effect.provide(generatorLayer({}))));
  await Effect.runPromise(CliInteraction.use((interaction) => interaction.confirm(driver, { message: "Continue?" })).pipe(Effect.provide(interactionLayer)));
}
`;

/**
 * Compiles strict positive examples and expected missing-domain failures.
 * @param source - Consumer source compiled directly against current declarations.
 * @returns Complete diagnostics without creating a repository-owned generated file.
 */
function diagnostics(source: string): readonly ts.Diagnostic[] {
  const filename = fileURLToPath(new URL(".invocation-consumer.ts", import.meta.url));
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
  "retains generator and prompt authority and compiles complete consumers",
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
  "detects erased invocation service requirements",
  () =>
    Effect.sync(() => {
      const result = diagnostics(
        probe.replace(
          "const missingService = CliGenerator.use((generator) => generator.previewCreate({}, {}));",
          "declare const missingService: Effect.Effect<unknown>;",
        ),
      );
      expect(result.some((item) => item.code === 2322)).toBe(true);
    }),
  20_000,
);
