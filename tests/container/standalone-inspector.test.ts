/** Real image ownership, host networking, credential rotation and persistent native history. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import {
  InspectionBridgeLive,
  InspectionFilesLive,
  InspectionNativeLive,
} from "@relkit/inspector-api/connection";
import { containerApplication } from "../fixtures/inspector/container-app.js";
import {
  inspectorContainer,
  waitContainer,
  dockerCall,
} from "../fixtures/inspector/container-process.js";
import { scaffoldNative } from "../../scripts/scaffold-native.js";

const live = InspectionBridgeLive.pipe(
  Layer.provide(Layer.merge(InspectionFilesLive, InspectionNativeLive)),
);

test(`${process.platform === "darwin" ? "Docker Desktop" : "Linux Docker"} host bridge preserves private mounts, rotation and history across recreate`, async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const app = yield* containerApplication();
      const container = yield* inspectorContainer({ ...app, descriptor: app.connection() });
      yield* waitContainer(
        container.request("/health/ready"),
        (response) => response.status === 200,
      );
      const initial = yield* waitContainer(container.request("/_relkit/v1/logs"), (response) =>
        response.text.includes("first-session"),
      );
      expect(initial.text).not.toContain("synthetic-secret");
      expect(initial.text).not.toContain("unselected-peer");
      const [inspection] = yield* container.inspection;
      assertContainerIsolation(inspection!);
      const rotation = yield* app.rotate;
      expect(rotation.current.token).not.toBe(rotation.previous.token);
      expect(rotation.current.sessionId).not.toBe(rotation.previous.sessionId);
      const after = yield* waitContainer(container.request("/_relkit/v1/logs"), (response) =>
        response.text.includes("rotated-session"),
      );
      expect(after.text).toContain("first-session");
      yield* stopContainer(container);
      const marker = yield* scaffoldNative("container.history-before", () =>
        readFile(join(app.history, ".inspection-project.json"), "utf8"),
      );
      const restarted = yield* inspectorContainer({ ...app, descriptor: app.connection() });
      const retained = yield* waitContainer(restarted.request("/_relkit/v1/logs"), (response) =>
        response.text.includes("rotated-session"),
      );
      expect(retained.text).toContain("first-session");
      expect(
        yield* scaffoldNative("container.history-after", () =>
          readFile(join(app.history, ".inspection-project.json"), "utf8"),
        ),
      ).toBe(marker);
      yield* stopContainer(restarted);
      expect(
        yield* dockerCall(["top", restarted.name, "-eo", "pid"]).pipe(Effect.result),
      ).toMatchObject({ _tag: "Failure" });
      const response = yield* Effect.promise(() => fetch(app.backend + "/hello"));
      expect(yield* Effect.promise(() => response.text())).toBe("backend alive");
    }).pipe(Effect.scoped, Effect.provide(live)),
  );
}, 120_000);

test("Linux host-gateway target keeps original authenticated descriptor identity", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const app = yield* containerApplication();
      const container = yield* inspectorContainer({
        ...app,
        descriptor: app.connection(),
        hostname: "linux-host",
      });
      const graph = yield* waitContainer(
        container.request("/_relkit/v1/graph"),
        (response) => response.status === 200,
      );
      expect(graph.text).toContain("container-graph");
      yield* container.stop;
      expect((yield* container.inspection)[0]!.State.ExitCode).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(live)),
  );
}, 60_000);

/** Checks actual image identity, host exposure and every allowed mount. */
function assertContainerIsolation(
  inspection: Effect.Success<
    Effect.Success<ReturnType<typeof inspectorContainer>>["inspection"]
  >[number],
) {
  expect(inspection.Config.User).toBe(`${process.getuid!()}:${process.getgid!()}`);
  expect(inspection.HostConfig).toMatchObject({
    ReadonlyRootfs: true,
    Memory: 536870912,
    NanoCpus: 1_000_000_000,
  });
  expect(inspection.Mounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ Destination: "/connections", RW: false }),
      expect.objectContaining({ Destination: "/history", RW: true }),
    ]),
  );
  expect(
    inspection.Mounts.every((mount) =>
      ["/connections", "/history", "/tmp"].includes(mount.Destination),
    ),
  ).toBe(true);
  expect(inspection.NetworkSettings.Ports["3210/tcp"]).toEqual([
    expect.objectContaining({ HostIp: "127.0.0.1" }),
  ]);
}

/** Observes clean signal exit for each independently owned container incarnation. */
const stopContainer = Effect.fn("Container.assertStopped")(function* (
  container: Effect.Success<ReturnType<typeof inspectorContainer>>,
) {
  yield* container.stop;
  expect((yield* container.inspection)[0]!.State).toMatchObject({ Running: false, ExitCode: 0 });
});
