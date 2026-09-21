import { expect, test } from "bun:test";
import { diagnoseJobMigration, diagnoseLegacyCompatibility } from "./src/index.ts";

const base = {
  name: "exportOrders",
  id: "orders.export",
  idSource: "explicit" as const,
  taskId: "orders.export",
  taskVersion: "1",
  inputSchemaHash: "input-v1",
  binding: "implicit" as const,
  publicFingerprint: "client-v1",
  clientFingerprint: "client-v1",
  hasHistoricalRuns: true,
  scheduleIds: ["nightly"],
  dedupeScope: "tenant",
};

test("explains identity, binding, schema, history, and client migration hazards", () => {
  const diagnostics = diagnoseJobMigration(base, {
    ...base,
    name: "exportOrderArchive",
    id: "exportOrderArchive",
    idSource: "name",
    binding: "explicit",
    taskVersion: "2",
    inputSchemaHash: "input-v2",
    publicFingerprint: "client-v2",
    clientFingerprint: "client-v2",
    scheduleIds: ["weekly"],
    dedupeScope: "account",
  });
  expect(diagnostics.map(({ code }) => code)).toEqual([
    "PINNED_JOB_ID_CHANGED",
    "IMPLICIT_TO_EXPLICIT_BINDING",
    "TASK_VERSION_CHANGED",
    "TASK_INPUT_SCHEMA_CHANGED",
    "PUBLIC_CLIENT_FINGERPRINT_CHANGED",
    "DEDUPE_SCOPE_CHANGED",
    "SCHEDULE_TARGET_CHANGED",
    "HISTORICAL_RUNS_PINNED",
  ]);
  expect(diagnostics.every((diagnostic) => diagnostic.message.length > 0)).toBe(true);
});

test("keeps legacy execution explicitly gated and aliases exclusive", () => {
  expect(
    diagnoseLegacyCompatibility({ usesFunctionTarget: true, legacyJobsEnabled: false })[0]?.code,
  ).toBe("LEGACY_JOBS_DISABLED");
  expect(
    diagnoseLegacyCompatibility({
      usesFunctionTarget: true,
      legacyJobsEnabled: true,
      legacyKeys: ["job"],
      newKeys: ["jobs"],
    })[0]?.code,
  ).toBe("LEGACY_ALIAS_CONFLICT");
  expect(
    diagnoseLegacyCompatibility({
      usesFunctionTarget: false,
      legacyJobsEnabled: false,
      legacyKeys: ["defaults.job"],
    })[0]?.code,
  ).toBe("LEGACY_ALIAS_DEPRECATED");
});
