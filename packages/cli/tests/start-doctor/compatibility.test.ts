import { expect, it } from "@effect/vitest";
import { GRAPH_VERSION } from "@relkit/contracts";
import { Cause, Effect, Exit, Layer } from "effect";
import { cliOriginalError } from "../../src/cli-errors.js";
import { readBuiltWorkflow } from "../../src/commands/start-built-workflow.js";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { testFiles } from "../read-services/test-files.js";

it.effect("retains the production rebuild diagnostic before graph validation or other reads", () =>
  Effect.gen(function* () {
    const reads: string[] = [];
    const result = yield* Effect.exit(
      readBuiltWorkflow("/build").pipe(
        Effect.provide(
          Layer.succeed(
            CliFileSystem,
            testFiles({
              readText: (path) =>
                Effect.sync(() => {
                  reads.push(path);
                  return JSON.stringify({ contractVersion: GRAPH_VERSION - 1 });
                }),
            }),
          ),
        ),
      ),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(cliOriginalError(Cause.squash(result.cause))).toEqual(
        new Error(
          `Built graph contract version ${GRAPH_VERSION - 1} is unsupported; expected ${GRAPH_VERSION}. Rebuild with \`relkit build\`.`,
        ),
      );
    }
    expect(reads).toEqual(["/build/application.graph.json"]);
  }),
);
