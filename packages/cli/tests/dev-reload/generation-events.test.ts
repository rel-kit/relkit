/**
 * Generation events say which `relkit dev` process emitted them and why the generation changed,
 * so a history built from them (the Inspector's) can tell a restart of the command from a
 * reload: versions start again at 0 in every session. The first generation of a session is a
 * `start`, a handler swap inside the serving process a `reload`, a new process after a
 * configuration change a `restart`, and a failed save carries the same identity.
 */
import { afterAll, expect, test } from "bun:test";
import { configSource, createDevFixture, functionSource, startDev } from "./dev-reload.fixture.js";
import type { DevProcess } from "./dev-reload.fixture.types.js";

/** A JSON log envelope of `relkit dev --json`, reduced to what the test reads. */
interface Envelope {
  readonly message: string;
  readonly fields: { readonly runId?: string; readonly reason?: string };
}

const fixture = createDevFixture();
const file = "src/services/beta/functions/b1.function.ts";
const running: DevProcess[] = [];

afterAll(async () => {
  for (const dev of running) await dev.stop();
  fixture.remove();
}, 60_000);

/**
 * Lists the generation events a session has written.
 * @param dev - Running development server in JSON mode.
 * @returns Its `dev.generation.*` envelopes in order.
 */
function generationEvents(dev: DevProcess): Envelope[] {
  return dev
    .output()
    .split("\n")
    .filter((line) => line.startsWith("{") && line.includes('"dev.generation.'))
    .map((line) => JSON.parse(line) as Envelope);
}

/**
 * Waits until a session has written a number of generation events.
 * @param dev - Running development server.
 * @param count - Events expected.
 * @returns The events.
 */
async function eventsAfter(dev: DevProcess, count: number): Promise<Envelope[]> {
  const deadline = Date.now() + 60_000;
  while (generationEvents(dev).length < count && Date.now() < deadline) await Bun.sleep(50);
  return generationEvents(dev);
}

test(
  "labels each generation event with its session and the reason it changed",
  async () => {
    const first = await startDev(fixture.root, false, ["--json"]);
    running.push(first);
    await first.waitFor("/b1", "b1 v0");
    fixture.write(file, functionSource("b1", "v1"));
    await first.waitFor("/b1", "b1 v1");
    fixture.write("relkit.config.ts", configSource(2_097_152));
    await eventsAfter(first, 3);
    fixture.write(file, `${functionSource("b1", "v2")}\nconst broken: = ;\n`);
    const events = await eventsAfter(first, 4);
    const runId = events[0]?.fields.runId;
    expect(runId).toBeString();
    expect(events.map((event) => [event.message, event.fields.reason])).toEqual([
      ["dev.generation.active", "start"],
      ["dev.generation.swapped", "reload"],
      ["dev.generation.active", "restart"],
      ["dev.generation.failed", "reload"],
    ]);
    expect(events.every((event) => event.fields.runId === runId)).toBe(true);
    await first.stop();
    fixture.write(file, functionSource("b1", "v3"));
    const second = await startDev(fixture.root, false, ["--json"]);
    running.push(second);
    await second.waitFor("/b1", "b1 v3");
    const [restarted] = await eventsAfter(second, 1);
    expect(restarted?.message).toBe("dev.generation.active");
    expect(restarted?.fields.reason).toBe("start");
    expect(restarted?.fields.runId).toBeString();
    expect(restarted?.fields.runId).not.toBe(runId);
  },
  { timeout: 240_000 },
);
