import { expect, test, vi } from "vitest";
import { withSignal } from "../src/signal.js";

test("cancellation removes the listener even when underlying work never settles", async () => {
  const controller = new AbortController();
  let finishWork = (_value: string) => {};
  const work = new Promise<string>((resolve) => { finishWork = resolve; });
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  const pending = withSignal(work, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "RELKIT_AGENT_CANCELLED" });
  expect(removed).toHaveBeenCalledTimes(1);
  finishWork("late result");
  await Promise.resolve();
  expect(removed).toHaveBeenCalledTimes(1);
});

test("an abort during listener registration rejects without starting a late settlement", async () => {
  const controller = new AbortController();
  const original = controller.signal.addEventListener.bind(controller.signal);
  vi.spyOn(controller.signal, "addEventListener").mockImplementation((...args) => {
    original(...args);
    controller.abort();
  });
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  await expect(withSignal(Promise.resolve("late"), controller.signal)).rejects.toMatchObject({
    code: "RELKIT_AGENT_CANCELLED",
  });
  expect(removed).toHaveBeenCalledTimes(1);
});
