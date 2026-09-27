import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import { z } from "@relkit/schema";
import {
  assertAuthorizedOperationEffect,
  assertJobGrantEffect,
  authorizeJobAccess,
  authorizeJobAccessEffect,
  JobAuthorizationError,
  JobAuthorizationFailure,
} from "../src/authorization.ts";
import { defineJob } from "../src/define-job.ts";
import { defineTask } from "../src/define-task.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";

const task = defineTask({
  id: "auth.effect",
  version: "1",
  input: z.string(),
  output: z.string(),
  handler: async (input) => input,
});
const trusted = { application: "app", environment: "test", scope: "tenant:a" };

test("Effect authorization narrows a policy grant and uses a telemetry Layer", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const job = defineJob({
    name: "privateAuthEffect",
    task,
    client: {
      operations: ["get"],
      authorize: () => ({ scope: "tenant:a:orders" }),
    },
  });
  const request = { operation: "get" as const, jobId: job.id };
  const grant = await Effect.runPromise(
    Effect.provide(authorizeJobAccessEffect(job, request, trusted), layer),
  );
  expect(grant).toEqual({ scope: "tenant:a:orders" });
  expect(seen).toEqual(["authorization.authorize", "authorization.grant"]);
  expect(await authorizeJobAccess(job, request, trusted)).toEqual(grant);
});

test("policy rejection becomes a tagged denial while adapter keeps its error", async () => {
  const job = defineJob({
    name: "rejectedAuthEffect",
    task,
    client: {
      operations: ["get"],
      authorize: () => Promise.reject(new Error("secret")),
    },
  });
  const request = { operation: "get" as const, jobId: job.id };
  const result = await Effect.runPromise(
    Effect.result(authorizeJobAccessEffect(job, request, trusted)),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(JobAuthorizationFailure);
    expect(result.failure._tag).toBe("Jobs.AuthorizationFailure");
    expect(result.failure.reason).toBe("policy");
  }
  await expect(authorizeJobAccess(job, request, trusted)).rejects.toBeInstanceOf(
    JobAuthorizationError,
  );
  expect(() => authorizeJobAccess(job, { ...request, jobId: "wrong" }, trusted)).toThrow(
    JobAuthorizationError,
  );
});

test("grant validation checks expiry and operation using deterministic time", async () => {
  const good = { scope: "tenant:a:orders", expiresAt: "2030-01-01T00:00:00Z" };
  expect(
    await Effect.runPromise(assertJobGrantEffect(good, trusted, Date.UTC(2029, 0, 1))),
  ).toEqual(good);
  const expired = await Effect.runPromise(
    Effect.result(assertJobGrantEffect(good, trusted, Date.UTC(2031, 0, 1))),
  );
  expect(Result.isFailure(expired)).toBe(true);
  await Effect.runPromise(
    assertAuthorizedOperationEffect(
      good,
      { operation: "get", jobId: "job" },
      trusted,
      Date.UTC(2029, 0, 1),
    ),
  );
  const invalid = await Effect.runPromise(
    Effect.result(
      assertAuthorizedOperationEffect(
        good,
        { operation: "get", jobId: "" },
        trusted,
        Date.UTC(2029, 0, 1),
      ),
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
});
