/** Native Linux private networking and foreign-history denial preserve the stored project. */
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import {
  InspectionBridgeLive,
  InspectionFilesLive,
  InspectionNativeLive,
} from "@relkit/inspector-api/connection";
import { containerApplication } from "../fixtures/inspector/container-app.js";
import { privateContainerApplication } from "../fixtures/inspector/container-private-app.js";
import {
  inspectorContainer,
  waitContainer,
  dockerCall,
} from "../fixtures/inspector/container-process.js";
import { scaffoldNative } from "../../scripts/scaffold-native.js";

const live = Layer.merge(
  InspectionFilesLive,
  InspectionBridgeLive.pipe(Layer.provide(Layer.merge(InspectionFilesLive, InspectionNativeLive))),
);

test("private Linux Docker network connects without publishing the app bridge", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const app = yield* privateContainerApplication();
      const container = yield* inspectorContainer(app);
      const graph = yield* waitContainer(
        container.request("/_relkit/v1/graph"),
        (response) => response.status === 200,
      );
      expect(graph.text).toContain("private-network-graph");
      expect(
        (yield* waitContainer(container.request("/_relkit/v1/logs"), (response) =>
          response.text.includes("private-network-record"),
        )).status,
      ).toBe(200);
      expect(yield* dockerCall(["port", app.name])).toBe("");
      yield* container.stop;
      expect((yield* container.inspection)[0]!.State.ExitCode).toBe(0);
      expect(yield* dockerCall(["inspect", "--format", "{{.State.Running}}", app.name])).toBe(
        "true",
      );
    }).pipe(Effect.scoped, Effect.provide(live)),
  );
}, 60_000);

test("foreign project credentials cannot read or replace an existing history volume", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const app = yield* containerApplication();
      const first = yield* inspectorContainer({ ...app, descriptor: app.connection() });
      yield* waitContainer(first.request("/_relkit/v1/logs"), (response) =>
        response.text.includes("first-session"),
      );
      yield* first.stop;
      const before = yield* historyHash(app.history);
      const foreign = yield* containerApplication();
      expect(foreign.connection().projectId).not.toBe(app.connection().projectId);
      yield* scaffoldNative("container.foreign-selection", async () => {
        await writeFile(app.selected + ".tmp", await readFile(foreign.selected), {
          mode: 0o600,
          flag: "wx",
        });
        await rename(app.selected + ".tmp", app.selected);
      });
      const rejected = yield* inspectorContainer({
        directory: app.directory,
        history: app.history,
        descriptor: foreign.connection(),
      });
      const status = yield* waitContainer(rejected.request("/_relkit/v1/storage"), (response) =>
        response.text.includes("history.foreign-project"),
      );
      expect(status.text).not.toContain("first-session");
      expect((yield* rejected.request("/_relkit/v1/logs")).status).toBe(503);
      yield* rejected.stop;
      expect(yield* historyHash(app.history)).toEqual(before);
      expect((yield* rejected.inspection)[0]!.State.ExitCode).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(live)),
  );
}, 60_000);

const historyHash = (directory: string) =>
  scaffoldNative("container.history-checksum", async () => {
    const result: Record<string, string> = {};
    for (const name of ["observability.duckdb", ".inspection-project.json"])
      result[name] = createHash("sha256")
        .update(await readFile(join(directory, name)))
        .digest("hex");
    return result;
  });
