/** Actual Docker process/mount authority with joined run-owned cleanup. */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Exit, Schema } from "effect";
import { docker } from "../../../scripts/tests/server-runtime/production-docker-owner.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { scaffoldPort } from "../../../scripts/scaffold-http.js";
import type { InspectionDescriptor } from "@relkit/inspector-api/connection";

export const dockerCall = (args: readonly string[]) =>
  scaffoldNative("inspector.docker", () => docker(args));

export const inspectorContainer = Effect.fn("Container.inspector")(function* (input: {
  readonly directory: string;
  readonly history: string;
  readonly descriptor: InspectionDescriptor;
  readonly hostname?: string;
  readonly network?: string;
  readonly targetHost?: string;
}) {
  const name = `relkit-inspector-test-${randomUUID()}`;
  const port = yield* scaffoldPort;
  yield* containerCleanup(name, input.history);
  yield* dockerCall([
    "run",
    "--detach",
    "--init",
    "--name",
    name,
    ...containerLimits,
    "--user",
    `${process.getuid!()}:${process.getgid!()}`,
    "--publish",
    `127.0.0.1:${port}:3210`,
    ...(input.network ? ["--network", input.network] : []),
    ...(input.hostname === "linux-host" || process.platform === "linux"
      ? ["--add-host", "relkit-host:host-gateway"]
      : []),
    "--mount",
    `type=bind,source=${input.directory},target=/connections,readonly`,
    "--mount",
    `type=bind,source=${input.history},target=/history`,
    process.env.RELKIT_INSPECTOR_IMAGE ?? "relkit-inspector:local",
    "--connection-file",
    "/connections/selected.json",
    "--history-directory",
    "/history",
    "--hostname",
    "0.0.0.0",
    "--target",
    `http://${input.targetHost ?? (input.hostname === "linux-host" || process.platform === "linux" ? "relkit-host" : "host.docker.internal")}:${new URL(input.descriptor.endpoint).port}`,
  ]);
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    name,
    baseUrl,
    request: (path: string) => requestContainer(baseUrl, path),
    stop: dockerCall(["stop", "--time", "5", name]),
    inspection: dockerCall(["inspect", name]).pipe(
      Effect.flatMap((text) =>
        Effect.try(() => Schema.decodeUnknownSync(containerInspection)(JSON.parse(text))),
      ),
    ),
  };
});

const containerInspection = Schema.Array(
  Schema.Struct({
    Config: Schema.Struct({ User: Schema.String }),
    HostConfig: Schema.Struct({
      ReadonlyRootfs: Schema.Boolean,
      Memory: Schema.Number,
      NanoCpus: Schema.Number,
    }),
    State: Schema.Struct({ Running: Schema.Boolean, ExitCode: Schema.Number }),
    Mounts: Schema.Array(
      Schema.Struct({ Destination: Schema.String, RW: Schema.Boolean, Type: Schema.String }),
    ),
    NetworkSettings: Schema.Struct({
      Ports: Schema.Record(
        Schema.String,
        Schema.Union([
          Schema.Null,
          Schema.Array(Schema.Struct({ HostIp: Schema.String, HostPort: Schema.String })),
        ]),
      ),
    }),
  }),
);

const requestContainer = Effect.fn("Container.request")((baseUrl: string, path: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(baseUrl + "/_relkit/backend" + path, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
      });
      return { status: response.status, text: await response.text() };
    },
    catch: (cause) => new Error("Inspector container HTTP request failed", { cause }),
  }),
);

/** Retries only bounded read probes; mutation results are never replayed. */
export const waitContainer = Effect.fn("Container.wait")(function* (
  operation: ReturnType<typeof requestContainer>,
  predicate: (response: { status: number; text: string }) => boolean,
) {
  let observed = "No response";
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = yield* Effect.result(operation);
    if (result._tag === "Success" && predicate(result.success)) return result.success;
    observed =
      result._tag === "Success"
        ? `HTTP ${result.success.status}: ${result.success.text.slice(0, 256)}`
        : result.failure.message;
    yield* Effect.sleep("250 millis");
  }
  return yield* Effect.fail(
    new Error(`Inspector container did not reach the expected state: ${observed}`),
  );
});

/** Applies the same resource and filesystem bounds to every image probe. */
const containerLimits = [
  "--cpus",
  "1",
  "--memory",
  "512m",
  "--memory-swap",
  "512m",
  "--pids-limit",
  "128",
  "--read-only",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges",
  "--tmpfs",
  "/tmp:rw,noexec,nosuid,size=128m",
];

/** Failure evidence is saved before the owned container is removed. */
const containerCleanup = (name: string, history: string) =>
  Effect.addFinalizer((exit) => {
    const retain = Exit.isFailure(exit)
      ? dockerCall(["logs", name]).pipe(
          Effect.flatMap((output) =>
            scaffoldNative("container.failure-log", () =>
              writeFile(join(history, "..", `${name}.log`), output),
            ),
          ),
        )
      : Effect.void;
    return retain.pipe(
      Effect.ensuring(dockerCall(["rm", "--force", name])),
      Effect.asVoid,
      Effect.orDie,
    );
  });
