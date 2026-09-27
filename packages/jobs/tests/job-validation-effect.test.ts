import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import {
  copyAdmissionEffect,
  copyClientEffect,
  JobValidationFailure,
} from "../src/job-validation.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
test("job policy Effect operations validate admission and client access", () => {
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
  const admission = Effect.runSync(
    Effect.provide(
      copyAdmissionEffect({ idempotency: { key: "tenantId" } }, z.object({ tenantId: z.string() })),
      layer,
    ),
  );
  expect(admission?.idempotency?.key).toBe("tenantId");
  expect(
    Effect.runSync(
      Effect.provide(copyClientEffect({ public: true, operations: ["trigger"] }, {}), layer),
    ),
  ).toMatchObject({ public: true, operations: ["trigger"] });
  const invalid = Effect.runSync(
    Effect.result(
      Effect.provide(copyClientEffect({ public: true, operations: ["bad"] }, {}), layer),
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(JobValidationFailure);
  expect(seen).toContain("jobValidation.admission");
  expect(seen).toContain("jobValidation.client");
});
