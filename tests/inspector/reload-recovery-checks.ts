/** Live assertions shared by the isolated Inspector recovery replay. */
import { strict as assert } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Fiber, Schedule } from "effect";
import type { RecoveryProcess } from "../../packages/cli/tests/dev-environment/recovery.types.js";

/** Checks a public route without assuming that an invalid OpenAPI payload is an empty graph. */
export function hasPath(specification: unknown, path: string): boolean {
  assert.ok(
    specification !== null && typeof specification === "object" && "paths" in specification,
  );
  const paths = specification.paths;
  assert.ok(paths !== null && typeof paths === "object");
  return Object.hasOwn(paths, path);
}

/** Samples the stable listener throughout edits and joins the sampler before checking evidence. */
export async function withRecoveryTraffic(
  baseUrl: string,
  output: string,
  action: () => Promise<void>,
) {
  const samples: { status: number; body: string }[] = [];
  const sample = Effect.promise(async (signal) => {
    try {
      const response = await fetch(`${baseUrl}/hello/probe`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
      });
      samples.push({ status: response.status, body: await response.text() });
    } catch (error) {
      if (!signal.aborted) samples.push({ status: 0, body: String(error) });
    }
  });
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* sample;
        const traffic = yield* sample.pipe(
          Effect.repeat(Schedule.spaced("100 millis")),
          Effect.forkScoped,
        );
        yield* Effect.promise(action);
        yield* Fiber.interrupt(traffic);
        yield* sample;
      }),
    ),
  ).finally(() => writeFile(join(output, "traffic.json"), JSON.stringify(samples, null, 2)));
  let previous = 0;
  for (const sample of samples) {
    assert.equal(sample.status, 200, JSON.stringify(sample));
    assert.match(sample.body, /^\{"message":"number:(7|30|31|32)"\}$/);
    const current = Number(sample.body.match(/number:(\d+)/)?.[1]);
    assert.ok(current >= previous, "The stable listener reverted to an older snapshot");
    previous = current;
  }
  assert.equal(previous, 32);
  console.log(`Continuous traffic: ${samples.length} successful responses, no outage or rollback.`);
}

/** Reads the specification and its generation from the same response, as Scalar does. */
export async function referenceSnapshot(inspectorUrl: string) {
  const response = await fetch(`${inspectorUrl}/_relkit/backend/_relkit/v1/openapi.json`);
  assert.equal(response.status, 200);
  const generation = response.headers.get("x-relkit-generation-id");
  assert.ok(generation);
  return { generation, specification: await response.json() };
}

/** Verifies active and stale browser requests without weakening the generation fence. */
export async function pinnedRequest(inspectorUrl: string, generation: string, marker?: number) {
  const response = await fetch(`${inspectorUrl}/_relkit/backend/hello/probe`, {
    method: "POST",
    headers: {
      origin: inspectorUrl,
      "x-relkit-generation-id": generation,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "probe" }),
  });
  assert.equal(response.status, marker === undefined ? 409 : 200);
  assert.deepEqual(
    await response.json(),
    marker === undefined
      ? { protocol: "relkit.inspector", version: 1, error: "generation.stale" }
      : { message: `number:${marker}` },
  );
}

/** Rejects two compile failures, retaining both API and Inspector snapshots until each repair. */
export async function sourceRecovery(
  root: string,
  dev: RecoveryProcess,
  inspectorUrl: string,
  browser: (...args: string[]) => Promise<string>,
) {
  let marker = 30;
  for (const [path, invalid] of [
    ["src/routes/hello/[name]/route.ts", "export default ("],
    ["src/hello/service.ts", "export default { invalid: true };"],
  ] as const) {
    const file = join(root, path);
    const original = await readFile(file, "utf8");
    const active = await referenceSnapshot(inspectorUrl);
    const before = dev.logs().length;
    await writeFile(file, invalid);
    await dev.wait("Rejected source candidate", () =>
      /dev\.generation\.failed|Reload failed; previous version/.test(dev.logs().slice(before)),
    );
    await browser("wait", "--text", "Latest reload failed");
    await browser("wait", "--text", "Showing the last valid snapshot");
    assert.deepEqual(await referenceSnapshot(inspectorUrl), active);
    await pinnedRequest(inspectorUrl, active.generation, marker);
    await pinnedRequest(inspectorUrl, "generation-invalid");
    await writeFile(join(root, ".env"), `DAYS=${++marker}\n`);
    await writeFile(file, original);
    await dev.wait(
      "Repaired source response",
      async () => (await dev.read()) === JSON.stringify({ message: `number:${marker}` }),
    );
    const repaired = await referenceSnapshot(inspectorUrl);
    assert.notEqual(repaired.generation, active.generation);
    await pinnedRequest(inspectorUrl, active.generation);
    await pinnedRequest(inspectorUrl, repaired.generation, marker);
    await browser("wait", "--fn", "!document.body.innerText.includes('Latest reload failed')");
  }
}
