/**
 * Ensures the gate cannot infer runtime, declaration or artifact isolation from
 * a successful installation. Each independent boundary must supply complete
 * observations, and measured forbidden paths still fail their own boundary.
 */
import { expect, it } from "vitest";
import { checkConsumerBoundaries } from "../consumer-boundaries.js";

it("refuses to certify four boundaries from installation evidence alone", () => {
  const result = checkConsumerBoundaries(
    [{ boundary: "installation", complete: true, evidence: "installed.json", paths: [] }],
    { stage: "1", exceptions: [] },
  );
  expect(result.passed).toBe(false);
  expect(result.incomplete).toEqual(["evaluation", "declarations", "artifact"]);
});

it("retains forbidden declarations even when installation is lean", () => {
  const result = checkConsumerBoundaries(
    [
      { boundary: "installation", complete: true, evidence: "installed.json", paths: [] },
      { boundary: "evaluation", complete: true, evidence: "executed.json", paths: [] },
      {
        boundary: "declarations",
        complete: true,
        evidence: "tsc.json",
        paths: [{ boundary: "declarations", packages: ["@relkit/client", "react"] }],
      },
      { boundary: "artifact", complete: true, evidence: "production.json", paths: [] },
    ],
    { stage: "1", exceptions: [] },
  );
  expect(result.passed).toBe(false);
  expect(result.incomplete).toEqual([]);
  expect(result.violations).toEqual([
    { boundary: "declarations", packages: ["@relkit/client", "react"] },
  ]);
});

it("rejects duplicate or mislabeled observations instead of hiding them", () => {
  expect(() =>
    checkConsumerBoundaries(
      [
        { boundary: "installation", complete: true, evidence: "first.json", paths: [] },
        { boundary: "installation", complete: true, evidence: "second.json", paths: [] },
      ],
      { stage: "final", exceptions: [] },
    ),
  ).toThrow(/Duplicate/);
  expect(() =>
    checkConsumerBoundaries(
      [
        {
          boundary: "installation",
          complete: true,
          evidence: "bad.json",
          paths: [{ boundary: "artifact", packages: ["langchain"] }],
        },
      ],
      { stage: "1", exceptions: [] },
    ),
  ).toThrow(/Mislabeled/);
});
