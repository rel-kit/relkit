/** Verifies generation inspector policy selects backend credentials before promotion applies it. */
import { expect, test } from "bun:test";
import { Effect, Ref } from "effect";
import { DEFAULT_TOOLING_CONFIG } from "@relkit/compiler";
import type { CandidateCompileRequest } from "@relkit/supervisor";
import { makeDevInspectionControl } from "../../src/commands/dev-inspection-control.js";
import type { DevCapture } from "../../src/commands/dev-capture.types.js";

/** Builds a compile request for one generation; only its token is read. */
function request(generationToken: number): CandidateCompileRequest {
  return {
    token: { sourceToken: generationToken, generationToken },
    projectRoot: "/project",
    outputDirectory: `/project/.relkit/generated/generation-${generationToken}`,
    signal: new AbortController().signal,
  };
}

const disabled = DEFAULT_TOOLING_CONFIG.inspector;
const enabled = { ...disabled, enabled: true };

test("enabled generations open capture and carry the stable session token", async () => {
  let enables = 0;
  let disables = 0;
  const capture = {
    enableEffect: Effect.sync(() => {
      enables += 1;
      return { RELKIT_TELEMETRY_URL: "http://127.0.0.1:1", RELKIT_TELEMETRY_TOKEN: "producer" };
    }),
    disableEffect: Effect.sync(() => void (disables += 1)),
  } as unknown as DevCapture;
  const control = makeDevInspectionControl(Ref.makeUnsafe<DevCapture | undefined>(capture), false);

  const on = await Effect.runPromise(control.prepare(enabled, request(1)));
  expect(on).toEqual({
    RELKIT_TELEMETRY_URL: "http://127.0.0.1:1",
    RELKIT_TELEMETRY_TOKEN: "producer",
    RELKIT_INSPECTOR_SESSION_TOKEN: control.identity.token,
  });
  const off = await Effect.runPromise(control.prepare(disabled, request(2)));
  expect(off).toEqual({
    RELKIT_TELEMETRY_URL: undefined,
    RELKIT_TELEMETRY_TOKEN: undefined,
    RELKIT_INSPECTOR_SESSION_TOKEN: undefined,
  });
  expect(enables).toBe(1);

  expect(control.policyFor(1)).toEqual(enabled.connection);
  expect(control.policyFor(2)).toBe(false);
  expect(control.policyFor(2)).toBeUndefined();

  await Effect.runPromise(control.applied(enabled.connection));
  expect(disables).toBe(0);
  await Effect.runPromise(control.applied(false));
  expect(disables).toBe(1);
});

test("promoting a newer generation forgets superseded policies", async () => {
  const control = makeDevInspectionControl(
    Ref.makeUnsafe<DevCapture | undefined>(undefined),
    false,
  );
  await Effect.runPromise(control.prepare(enabled, request(3)));
  await Effect.runPromise(control.prepare(disabled, request(4)));
  expect(control.policyFor(4)).toBe(false);
  expect(control.policyFor(3)).toBeUndefined();
});

/** Counts capture acquisitions and releases without opening a listener. */
function countingCapture() {
  const counts = { enables: 0, disables: 0 };
  const capture = {
    enableEffect: Effect.sync(() => {
      counts.enables += 1;
      return { RELKIT_TELEMETRY_URL: "http://127.0.0.1:1", RELKIT_TELEMETRY_TOKEN: "producer" };
    }),
    disableEffect: Effect.sync(() => void (counts.disables += 1)),
  } as unknown as DevCapture;
  return { counts, ref: Ref.makeUnsafe<DevCapture | undefined>(capture) };
}

test("a rejected enabled generation releases capture while inspection stays off", async () => {
  const { counts, ref } = countingCapture();
  const control = makeDevInspectionControl(ref, false);
  await Effect.runPromise(control.prepare(enabled, request(1)));
  expect(counts.enables).toBe(1);
  await Effect.runPromise(control.rejected(1));
  expect(counts.disables).toBe(1);
  expect(control.policyFor(1)).toBeUndefined();
});

test("a rejected generation keeps capture while the serving bridge is enabled", async () => {
  const { counts, ref } = countingCapture();
  const control = makeDevInspectionControl(ref, enabled.connection);
  await Effect.runPromise(control.prepare(enabled, request(1)));
  await Effect.runPromise(control.rejected(1));
  await Effect.runPromise(control.prepare(disabled, request(2)));
  await Effect.runPromise(control.rejected(2));
  expect(counts.disables).toBe(0);
});

test("every disabled promotion reconciles capture even without a bridge change", async () => {
  const { counts, ref } = countingCapture();
  const control = makeDevInspectionControl(ref, false);
  await Effect.runPromise(control.prepare(enabled, request(1)));
  await Effect.runPromise(control.prepare(disabled, request(2)));
  await Effect.runPromise(control.applied(control.policyFor(2)!));
  expect(counts.disables).toBe(1);
});
