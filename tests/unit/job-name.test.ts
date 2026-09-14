import { expect, test } from "bun:test";
import {
  JOB_NAME_RESERVED,
  assertJobName,
  isJobName,
  normalizeJobName,
} from "../../packages/jobs/src/job-name.ts";

test("accepts safe camelCase job names", () => {
  for (const name of ["sendEmail", "a", "job2", "a".repeat(64)]) {
    expect(isJobName(name)).toBe(true);
    expect(normalizeJobName(name)).toBe(name);
    expect(() => assertJobName(name)).not.toThrow();
  }
});

test("rejects unsafe and reserved job names", () => {
  const invalid = ["", "SendEmail", "send-email", "send_email", "1send", "a".repeat(65), ...JOB_NAME_RESERVED];
  for (const name of invalid) {
    expect(isJobName(name)).toBe(false);
    expect(() => assertJobName(name)).toThrow();
  }
});
