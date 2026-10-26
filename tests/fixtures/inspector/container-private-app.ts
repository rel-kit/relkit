/** Runs the app bridge inside a private Linux network using installed candidate dependencies. */
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Effect, Exit } from "effect";
import { InspectionFiles } from "@relkit/inspector-api/connection";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { dockerCall } from "./container-process.js";

const application = `
import { mkdir, copyFile } from "node:fs/promises";
import { Effect, Layer } from "effect";
import { BunRuntime } from "@effect/platform-bun";
import { InspectionBridge, InspectionBridgeLive, InspectionFilesLive, InspectionNativeLive, InspectionCapture } from "@relkit/inspector-api/connection";
import { inspectorContainerTeardown } from "./dist/container-exit.js";
const program = Effect.gen(function* () {
  yield* Effect.promise(() => mkdir("/tmp/bridge-app", { recursive: true }));
  const app = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>Response.json({protocol:"relkit.inspector",version:1,generationId:"private-generation",graphHash:"private-network-graph",nodes:[],edges:[]})})), (app)=>Effect.promise(()=>app.stop(true)));
  const capture = yield* InspectionCapture.make({});
  yield* capture.append({version:2,signal:"log",timestamp:new Date().toISOString(),level:"info",component:"private-app",message:"private-network-record",fields:{}});
  const bridge = yield* InspectionBridge.use((service)=>service.start({root:"/tmp/bridge-app",host:"0.0.0.0",port:43210,active:()=>({endpoint:"http://127.0.0.1:"+app.port,generationId:"private-generation",capabilities:["graph","records"]}),records:capture.records}));
  yield* Effect.promise(()=>copyFile(bridge.path,"/connection-output/selected.json"));
  yield* Effect.never;
});
BunRuntime.runMain(program.pipe(Effect.scoped,Effect.provide(InspectionBridgeLive.pipe(Layer.provide(Layer.merge(InspectionFilesLive,InspectionNativeLive))))),{disableErrorReporting:true,teardown:inspectorContainerTeardown});
`;

export const privateContainerApplication = Effect.fn("Container.privateApplication")(function* () {
  const id = randomUUID();
  const root = yield* Effect.acquireRelease(
    scaffoldNative("container.private-root", () =>
      mkdtemp(join(tmpdir(), "relkit-inspector-private-")),
    ),
    (root, exit) =>
      Exit.isSuccess(exit)
        ? scaffoldNative("container.private-close", () =>
            rm(root, { recursive: true, force: true }),
          ).pipe(Effect.orDie)
        : Effect.logWarning("Private network failure retained", { root }),
  );
  const directory = join(root, "connections"),
    history = join(root, "history");
  yield* scaffoldNative("container.private-directories", async () => {
    await mkdir(directory, { mode: 0o700 });
    await mkdir(history, { mode: 0o700 });
  });
  const network = `relkit-inspector-network-${id}`,
    name = `relkit-inspector-app-${id}`;
  yield* Effect.acquireRelease(dockerCall(["network", "create", network]), () =>
    dockerCall(["network", "rm", network]).pipe(Effect.asVoid, Effect.orDie),
  );
  yield* launchPrivateApplication(directory, network, name);
  const files = yield* InspectionFiles;
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = yield* Effect.result(files.read(join(directory, "selected.json")));
    if (result._tag === "Success")
      return {
        root,
        directory,
        history,
        network,
        targetHost: name,
        descriptor: result.success.descriptor,
        name,
      };
    yield* Effect.sleep("250 millis");
  }
  return yield* Effect.fail(new Error("Private-network app did not publish its connection"));
});

/** Joins only this fixture's unpublished application container. */
const launchPrivateApplication = Effect.fn("Container.launchPrivateApp")(function* (
  directory: string,
  network: string,
  name: string,
) {
  yield* Effect.addFinalizer(() =>
    dockerCall(["rm", "--force", name]).pipe(Effect.asVoid, Effect.orDie),
  );
  yield* dockerCall([
    "run",
    "--detach",
    "--init",
    "--name",
    name,
    "--network",
    network,
    "--cpus",
    "1",
    "--memory",
    "256m",
    "--pids-limit",
    "64",
    "--user",
    `${process.getuid!()}:${process.getgid!()}`,
    "--mount",
    `type=bind,source=${directory},target=/connection-output`,
    "--workdir",
    "/app/node_modules/@relkit/inspector",
    "--entrypoint",
    "bun",
    process.env.RELKIT_INSPECTOR_IMAGE ?? "relkit-inspector:local",
    "-e",
    application,
  ]);
});
