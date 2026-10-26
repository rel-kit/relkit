/** Shares the native signal owner between package and restricted container entries. */
import { BunRuntime } from "@effect/platform-bun";
import { Cause, Effect } from "effect";
import { InspectionConnectionError } from "@relkit/inspector-api/connection";
import { parseInspectorOptions, INSPECTOR_HELP } from "./options.js";
import { InspectorTool, InspectorToolLive } from "./tool.service.js";
import { requireInspectorContainer } from "./container-native.js";
import { inspectorContainerTeardown } from "./container-exit.js";

export function runInspectorMain(container: boolean): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(INSPECTOR_HELP);
    return;
  }
  BunRuntime.runMain(
    Effect.gen(function* () {
      const options = yield* Effect.try({
        try: () => parseInspectorOptions(process.argv.slice(2)),
        catch: (cause) =>
          new InspectionConnectionError({
            operation: "launch.invalid",
            cause: cause instanceof Error ? cause : new Error("Invalid launch options"),
          }),
      });
      if (container) yield* requireInspectorContainer(options);
      yield* InspectorTool.use((tool) => tool.run(options));
    }).pipe(
      Effect.provide(InspectorToolLive),
      Effect.tapCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.void;
        const failure = cause.reasons.find((reason) => reason._tag === "Fail");
        const operation =
          failure?._tag === "Fail" && failure.error instanceof InspectionConnectionError
            ? failure.error.operation
            : "unexpected";
        return Effect.logError(
          "Inspector stopped; verify launch options, private connection directory and persistent history mount",
          { operation },
        );
      }),
    ),
    { disableErrorReporting: true, teardown: container ? inspectorContainerTeardown : undefined },
  );
}
