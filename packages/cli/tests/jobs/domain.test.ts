import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Logger, Metric } from "effect";
import { cliAdapterError, cliOriginalError } from "../../src/cli-errors.js";
import { CliFileSystem } from "../../src/services/filesystem.service.js";
import { CliHttp } from "../../src/services/http.service.js";
import { CliJobsSdk } from "../../src/services/jobs-sdk.service.js";
import { CliJobs, jobsLayer } from "../../src/services/jobs.service.js";
import type { HttpCapabilities } from "../../src/services/http.types.js";
import type { JobsSdkOperations } from "../../src/services/jobs-sdk.types.js";
import { JobsCommandError } from "../../src/commands/jobs-error.js";
import { parse as parseJobs } from "../../src/commands/jobs-support.js";
import { testFiles } from "../read-services/test-files.js";
import { readJobsManifestEffect } from "../../src/commands/jobs-json.js";

const unexpected = () => Effect.die(new Error("Unexpected SDK authority"));
const sdk: JobsSdkOperations = { trigger: unexpected, watch: unexpected };

it.effect("observes standalone manifest workflows with a fixed label and no private path", () =>
  Effect.gen(function* () {
    const registry: Metric.MetricRegistry = new Map();
    yield* readJobsManifestEffect("/private-project").pipe(
      Effect.provideService(CliFileSystem, testFiles({ readText: () => Effect.succeed("{}") })),
      Effect.provideService(Metric.MetricRegistry, registry),
      Effect.provide(Logger.layer([])),
    );
    const attributes = [...registry.values()].map((entry) => entry.attributes);
    expect(attributes.some((entry) => entry?.operation === "jobs.manifest.workflow")).toBe(true);
    expect(JSON.stringify(attributes)).not.toContain("private-project");
  }),
);

/**
 * Provides only deterministic authority selected by a scenario.
 * @param http - Explicit response and bounded JSON authority.
 * @param native - Optional native mutation implementation.
 * @param text - Optional application-owned input and manifest bytes.
 * @returns A jobs graph with no global filesystem or network fallback.
 */
function testLayer(http: HttpCapabilities, native = sdk, text = "{}") {
  return jobsLayer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(CliHttp, http),
        Layer.succeed(CliJobsSdk, native),
        Layer.succeed(CliFileSystem, testFiles({ readText: () => Effect.succeed(text) })),
      ),
    ),
  );
}

/**
 * Makes a bounded JSON HTTP double retaining normal parse failures.
 * @param request - Deterministic response authority.
 * @returns Complete HTTP authority with unexpected text reads rejected.
 */
function testHttp(request: HttpCapabilities["request"]): HttpCapabilities {
  return {
    request,
    json: (response) =>
      Effect.tryPromise({
        try: () => response.json(),
        catch: (cause) => cliAdapterError("fixture.json", cause),
      }),
    text: unexpected,
  };
}

it.effect("identity validation preserves original public constructor and error code", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      CliJobs.use((jobs) => jobs.identity()).pipe(
        Effect.provide(
          testLayer(testHttp(() => Effect.succeed(Response.json({ identityScope: 1 })))),
        ),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const primary = cliOriginalError(Cause.squash(exit.cause));
      expect(primary).toBeInstanceOf(JobsCommandError);
      expect(primary).toMatchObject({
        code: "RELKIT_JOBS_REQUEST_FAILED",
        message: "Client identity is invalid.",
      });
    }
  }),
);

it.effect("optional manifest failures fall back while filesystem defects remain visible", () =>
  Effect.gen(function* () {
    const http = testHttp(unexpected);
    const malformed = yield* CliJobs.use((jobs) => jobs.manifest("/fixture")).pipe(
      Effect.provide(testLayer(http, sdk, "[")),
    );
    expect(malformed).toBeUndefined();
    const defect = new Error("unexpected filesystem defect");
    const exit = yield* Effect.exit(
      CliJobs.use((jobs) => jobs.manifest("/fixture")).pipe(
        Effect.provide(jobsLayer),
        Effect.provideService(CliHttp, http),
        Effect.provideService(CliJobsSdk, sdk),
        Effect.provideService(CliFileSystem, testFiles({ readText: () => Effect.die(defect) })),
      ),
    );
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(defect);
    else throw new Error("Expected filesystem defect");
  }),
);

it.effect("ambiguous trigger failures submit once and retain recovery identifiers", () =>
  Effect.gen(function* () {
    let calls = 0;
    const ambiguity = Object.assign(new Error("Provider acceptance is unknown"), {
      code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
      data: {
        operationId: "operation-1",
        idempotencyKey: "key-1",
        recovery: { action: "retry-with-same-key" },
      },
    });
    const http = testHttp((url) =>
      Effect.succeed(
        Response.json(
          String(url).endsWith("/client/identity")
            ? { identityScope: "scope", sessionEpoch: "epoch", publicFingerprint: "fingerprint" }
            : { items: [{ id: "orders.export", name: "exportOrders" }] },
        ),
      ),
    );
    const parsed = parseJobs([
      "trigger",
      "--job",
      "orders.export",
      "--input-file",
      "input.json",
      "--operation-id",
      "operation-1",
      "--idempotency-key",
      "key-1",
    ]);
    const exit = yield* Effect.exit(
      CliJobs.use((jobs) => jobs.trigger(parsed, new AbortController().signal)).pipe(
        Effect.provide(
          testLayer(http, {
            watch: unexpected,
            trigger: () =>
              Effect.suspend(() => {
                calls++;
                return Effect.fail(cliAdapterError("fixture.trigger", ambiguity));
              }),
          }),
        ),
      ),
    );
    expect(calls).toBe(1);
    if (Exit.isFailure(exit))
      expect(cliOriginalError(Cause.squash(exit.cause))).toMatchObject({
        code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
        message: expect.stringContaining("operationId=operation-1"),
      });
    else throw new Error("Expected ambiguous outcome");
  }),
);
