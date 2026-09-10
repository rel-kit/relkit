import { expect, test } from "bun:test";
import { RealtimeManager, type RealtimeStatus } from "./src/react/realtime-manager.ts";

test("reports connection failures to the channel status listener", async () => {
  const manager = new RealtimeManager({
    "relkit.realtime.subscribe": () => Promise.reject(new Error("offline")),
  });
  const statuses: RealtimeStatus[] = [];
  const failed = Promise.withResolvers<void>();
  const unsubscribe = manager.subscribe(
    "announcements",
    {},
    () => undefined,
    (status) => {
      statuses.push(status);
      if (status === "error") failed.resolve();
    },
  );

  await failed.promise;
  unsubscribe();
  expect(statuses).toEqual(["connecting", "error"]);
});
