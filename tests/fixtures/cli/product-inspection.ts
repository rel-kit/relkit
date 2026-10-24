/** Owns the compiled full-graph dev generation and its separate real Inspector process. */
import { Effect, Exit, Scope } from "effect";
import {
  CliDevCapture,
  devCaptureLayer,
} from "../../../packages/cli/src/commands/dev-capture.service.js";
import { createDevLocalCompiler } from "../../../packages/cli/src/commands/dev-local.js";
import { startDev } from "../../../packages/cli/src/commands/dev.js";
import { launchGeneratedTool, toolReply } from "../inspector/generated-app.js";

interface InspectionOwner {
  readonly scope: Scope.Closeable;
  readonly compiler: ReturnType<typeof createDevLocalCompiler>;
  session?: Awaited<ReturnType<typeof startDev>>;
  tool?: Awaited<ReturnType<typeof launchGeneratedTool>>;
}

/** Releases each acquired owner even when a later acquisition or shutdown fails. */
async function close(owner: InspectionOwner) {
  try {
    await owner.tool?.close();
  } finally {
    try {
      await owner.session?.stop();
    } finally {
      try {
        await owner.compiler.close();
      } finally {
        await Effect.runPromise(Scope.close(owner.scope, Exit.void));
      }
    }
  }
}

/** Uses the actual memory producer, authenticated session and packaged UI/history runtime. */
export async function openProductInspection(projectRoot: string) {
  const owner: InspectionOwner = {
    scope: Effect.runSync(Scope.make()),
    compiler: createDevLocalCompiler(projectRoot, false),
  };
  try {
    const capture = await Effect.runPromise(
      CliDevCapture.use((service) => service.acquire(true, {})).pipe(
        Scope.provide(owner.scope),
        Effect.provide(devCaptureLayer),
      ),
    );
    owner.session = await startDev({
      projectRoot,
      compile: owner.compiler.compile,
      inspector: { host: "127.0.0.1", port: 0 },
      stablePort: 0,
      installSignalHandlers: false,
      logger: { human: false, json: false },
      environment: { RELKIT_DEV_LOGS: "1", ...capture.environment },
      inspectionRecords: capture.records,
      onRecord: capture.append,
      observability: { append: capture.append },
    });
    owner.tool = await launchGeneratedTool(projectRoot);
    await toolReply(owner.tool, "/_relkit/v1/graph", "graphHash");
    return {
      inspection: `http://127.0.0.1:${owner.tool.port}/_relkit/backend`,
      close: () => close(owner),
    };
  } catch (cause) {
    await close(owner);
    throw cause;
  }
}
